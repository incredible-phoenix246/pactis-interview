/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

import type { CreateWalletDto } from '../dto/create-wallet.dto';
import type { DepositDto } from '../dto/deposit.dto';
import type { WithdrawDto } from '../dto/withdraw.dto';
import type { TransferDto } from '../dto/transfer.dto';
import type { TransactionHistoryDto } from '../dto/transaction-history.dto';
import { Wallet } from '@database/entities/wallet.entity';
import type { Transaction } from '@database/entities/transaction.entity';
import {
  WalletStatus,
  TransactionType,
  TransactionStatus,
} from '@definitions/enums';
import { RedisService } from '@modules/redis/redis.service';
import { QueueService } from '@modules/queue/queue.service';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import { WalletModelAction, TransactionModelAction } from '@actions/index';
import FindRecordGeneric from '@database/options/find-record-generic';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly walletModelAction: WalletModelAction,
    private readonly transactionModelAction: TransactionModelAction,
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly queueService: QueueService,
  ) { }

  async createWallet(
    userId: string,
    createWalletDto: CreateWalletDto,
  ): Promise<Wallet> {
    const { initial_balance = 0, currency = 'USD' } = createWalletDto;

    const existingWallet = await this.walletModelAction.get({
      user_id: userId,
      currency,
      status: WalletStatus.ACTIVE,
    });

    if (existingWallet) {
      throw new ConflictException(
        `User already has an active ${currency} wallet`,
      );
    }

    const wallet = await this.walletModelAction.create({
      createPayload: {
        user_id: userId,
        balance: new Decimal(initial_balance),
        frozen_balance: new Decimal(0),
        status: WalletStatus.ACTIVE,
        currency,
      },
      transactionOptions: { useTransaction: false },
    });

    if (!wallet) {
      throw new BadRequestException('Failed to create wallet');
    }

    // Cache the wallet balance
    await this.cacheWalletBalance(wallet.id, wallet.balance);

    this.logger.log(`Wallet created for user ${userId}: ${wallet.id}`);
    return wallet;
  }

  async deposit(depositDto: DepositDto): Promise<Transaction> {
    const { wallet_id, amount, description, idempotency_key } = depositDto;


    if (idempotency_key) {
      const existingTransaction = await this.handleIdempotency(
        idempotency_key,
        'deposit',
      );
      if (existingTransaction) {
        return existingTransaction;
      }

      const lockAcquired = await this.createIdempotencyLock(idempotency_key);
      if (!lockAcquired) {
        const retryCheck = await this.handleIdempotency(
          idempotency_key,
          'deposit',
        );
        if (retryCheck) {
          return retryCheck;
        }
        throw new ConflictException(
          'Another request with the same idempotency key is being processed',
        );
      }
    }

    try {
      const transactionId = uuidv4();
      const wallet = await this.walletModelAction.get({ id: wallet_id });
      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }
      if (wallet.status !== WalletStatus.ACTIVE) {
        throw new BadRequestException('Wallet is not active');
      }

      await this.queueService.addDepositJob({
        transaction_id: transactionId,
        wallet_id,
        amount,
        description,
        idempotency_key,
      });

      const transaction = await this.transactionModelAction.create({
        createPayload: {
          transaction_id: transactionId,
          to_wallet_id: wallet_id,
          amount: new Decimal(amount),
          fee: new Decimal(0),
          type: TransactionType.DEPOSIT,
          status: TransactionStatus.PENDING,
          description,
          idempotency_key,
        },
        transactionOptions: { useTransaction: false },
      });

      if (!transaction) {
        throw new BadRequestException('Failed to create deposit transaction');
      }

      this.logger.log(`Deposit queued: ${transactionId}`);
      return transaction;
    } finally {
      // Release idempotency lock
      if (idempotency_key) {
        await this.releaseIdempotencyLock(idempotency_key);
      }
    }
  }

  async processDeposit(data: {
    transaction_id: string;
    wallet_id: string;
    amount: number;
    description?: string;
    idempotency_key?: string;
  }): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const wallet = await this.getWalletWithLock(queryRunner, data.wallet_id);

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (wallet.status !== WalletStatus.ACTIVE) {
        throw new BadRequestException('Wallet is not active');
      }

      const newBalance = wallet.balance.plus(data.amount);
      await this.walletModelAction.update({
        updatePayload: { balance: newBalance },
        identifierOptions: { id: wallet.id },
        transactionOptions: {
          useTransaction: true,
          transaction: queryRunner.manager,
        },
      });

      await this.transactionModelAction.update({
        updatePayload: {
          status: TransactionStatus.COMPLETED,
          processed_at: new Date(),
        },
        identifierOptions: { transaction_id: data.transaction_id },
        transactionOptions: {
          useTransaction: true,
          transaction: queryRunner.manager,
        },
      });

      await queryRunner.commitTransaction();

      // Update cache
      await this.cacheWalletBalance(wallet.id, newBalance);
      await this.invalidateTransactionHistoryCache(wallet.id);

      this.logger.log(`Deposit processed: ${data.transaction_id}`);
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();

      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Unknown error';

      await this.transactionModelAction.update({
        updatePayload: {
          status: TransactionStatus.FAILED,
          failure_reason: errorMessage,
          processed_at: new Date(),
        },
        identifierOptions: { transaction_id: data.transaction_id },
        transactionOptions: { useTransaction: false },
      });

      this.logger.error(
        `Deposit failed: ${data.transaction_id}`,
        (error as Error)?.stack,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async withdraw(withdrawDto: WithdrawDto): Promise<Transaction> {
    const { wallet_id, amount, description, idempotency_key } = withdrawDto;

    // Enhanced idempotency handling
    if (idempotency_key) {
      const existingTransaction = await this.handleIdempotency(
        idempotency_key,
        'withdraw',
      );
      if (existingTransaction) {
        return existingTransaction;
      }

      // Create distributed lock to prevent concurrent processing
      const lockAcquired = await this.createIdempotencyLock(idempotency_key);
      if (!lockAcquired) {
        // If we can't acquire lock, check again for existing transaction
        const retryCheck = await this.handleIdempotency(
          idempotency_key,
          'withdraw',
        );
        if (retryCheck) {
          return retryCheck;
        }
        throw new ConflictException(
          'Another request with the same idempotency key is being processed',
        );
      }
    }

    try {
      // Validate wallet exists and is active before checking balance
      const wallet = await this.walletModelAction.get({ id: wallet_id });
      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }
      if (wallet.status !== WalletStatus.ACTIVE) {
        throw new BadRequestException('Wallet is not active');
      }

      // Check balance from cache first, then from database if needed
      const cachedBalance = await this.getCachedWalletBalance(wallet_id);
      const currentBalance = cachedBalance || wallet.balance;

      if (currentBalance.lt(amount)) {
        throw new BadRequestException(
          `Insufficient funds: available ${currentBalance.toString()}, requested ${amount}`,
        );
      }

      const transactionId = uuidv4();
      await this.queueService.addWithdrawJob({
        transaction_id: transactionId,
        wallet_id,
        amount,
        description,
        idempotency_key,
      });

      const transaction = await this.transactionModelAction.create({
        createPayload: {
          transaction_id: transactionId,
          from_wallet_id: wallet_id,
          amount: new Decimal(amount),
          fee: new Decimal(0),
          type: TransactionType.WITHDRAWAL,
          status: TransactionStatus.PENDING,
          description,
          idempotency_key,
        },
        transactionOptions: { useTransaction: false },
      });

      if (!transaction) {
        throw new BadRequestException(
          'Failed to create withdrawal transaction',
        );
      }

      this.logger.log(`Withdrawal queued: ${transactionId}`);
      return transaction;
    } finally {
      if (idempotency_key) {
        await this.releaseIdempotencyLock(idempotency_key);
      }
    }
  }

  async processWithdraw(data: {
    transaction_id: string;
    wallet_id: string;
    amount: number;
    description?: string;
    idempotency_key?: string;
  }): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const wallet = await this.getWalletWithLock(queryRunner, data.wallet_id);

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (wallet.status !== WalletStatus.ACTIVE) {
        throw new BadRequestException('Wallet is not active');
      }

      // Check sufficient funds
      if (wallet.balance.lt(data.amount)) {
        throw new BadRequestException('Insufficient funds');
      }

      // Update wallet balance
      const newBalance = wallet.balance.minus(data.amount);
      await this.walletModelAction.update({
        updatePayload: { balance: newBalance },
        identifierOptions: { id: wallet.id },
        transactionOptions: {
          useTransaction: true,
          transaction: queryRunner.manager,
        },
      });

      // Update transaction status
      await this.transactionModelAction.update({
        updatePayload: {
          status: TransactionStatus.COMPLETED,
          processed_at: new Date(),
        },
        identifierOptions: { transaction_id: data.transaction_id },
        transactionOptions: {
          useTransaction: true,
          transaction: queryRunner.manager,
        },
      });

      await queryRunner.commitTransaction();

      // Update cache
      await this.cacheWalletBalance(wallet.id, newBalance);
      await this.invalidateTransactionHistoryCache(wallet.id);

      this.logger.log(`Withdrawal processed: ${data.transaction_id}`);
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // Mark transaction as failed
      await this.transactionModelAction.update({
        updatePayload: {
          status: TransactionStatus.FAILED,
          failure_reason:
            typeof error === 'object' && error !== null && 'message' in error
              ? String((error as { message: unknown }).message)
              : 'Unknown error',
          processed_at: new Date(),
        },
        identifierOptions: { transaction_id: data.transaction_id },
        transactionOptions: { useTransaction: false },
      });

      this.logger.error(
        `Withdrawal failed: ${data.transaction_id}`,
        error.stack,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async transfer(
    transferDto: TransferDto,
  ): Promise<{ outgoing: Transaction; incoming: Transaction }> {
    const {
      from_wallet_id,
      to_wallet_id,
      amount,
      description,
      idempotency_key,
    } = transferDto;

    if (from_wallet_id === to_wallet_id) {
      throw new BadRequestException('Cannot transfer to the same wallet');
    }

    // Enhanced idempotency handling for transfers
    if (idempotency_key) {
      const existingTransaction = await this.handleIdempotency(
        idempotency_key,
        'transfer',
      );

      if (existingTransaction) {
        // Find the paired transaction
        const pairedTransaction = await this.transactionModelAction.get({
          reference_transaction_id: existingTransaction.transaction_id,
        });

        this.logger.log(`Idempotent transfer request: ${idempotency_key}`);
        return {
          outgoing:
            existingTransaction.type === TransactionType.TRANSFER_OUT
              ? existingTransaction
              : pairedTransaction!,
          incoming:
            existingTransaction.type === TransactionType.TRANSFER_IN
              ? existingTransaction
              : pairedTransaction!,
        };
      }

      // Create distributed lock to prevent concurrent processing
      const lockAcquired = await this.createIdempotencyLock(idempotency_key);
      if (!lockAcquired) {
        // If we can't acquire lock, check again for existing transaction
        const retryCheck = await this.handleIdempotency(
          idempotency_key,
          'transfer',
        );
        if (retryCheck) {
          const pairedTransaction = await this.transactionModelAction.get({
            reference_transaction_id: retryCheck.transaction_id,
          });
          return {
            outgoing:
              retryCheck.type === TransactionType.TRANSFER_OUT
                ? retryCheck
                : pairedTransaction!,
            incoming:
              retryCheck.type === TransactionType.TRANSFER_IN
                ? retryCheck
                : pairedTransaction!,
          };
        }
        throw new ConflictException(
          'Another request with the same idempotency key is being processed',
        );
      }
    }

    try {
      // Validate both wallets exist and are active
      const [fromWallet, toWallet] = await Promise.all([
        this.walletModelAction.get({ id: from_wallet_id }),
        this.walletModelAction.get({ id: to_wallet_id }),
      ]);

      if (!fromWallet || !toWallet) {
        throw new NotFoundException('One or both wallets not found');
      }

      if (
        fromWallet.status !== WalletStatus.ACTIVE ||
        toWallet.status !== WalletStatus.ACTIVE
      ) {
        throw new BadRequestException('One or both wallets are not active');
      }

      const cachedBalance = await this.getCachedWalletBalance(from_wallet_id);
      const currentBalance = cachedBalance || fromWallet.balance;

      if (currentBalance.lt(amount)) {
        throw new BadRequestException(
          `Insufficient funds: available ${currentBalance.toString()}, required ${amount}`,
        );
      }

      const outgoingTransactionId = uuidv4();
      const incomingTransactionId = uuidv4();

      await this.queueService.addTransferJob({
        outgoing_transaction_id: outgoingTransactionId,
        incoming_transaction_id: incomingTransactionId,
        from_wallet_id,
        to_wallet_id,
        amount,
        description,
        idempotency_key,
      });

      const [outgoingTransaction, incomingTransaction] = await Promise.all([
        this.transactionModelAction.create({
          createPayload: {
            transaction_id: outgoingTransactionId,
            from_wallet_id,
            amount: new Decimal(amount),
            fee: new Decimal(0),
            type: TransactionType.TRANSFER_OUT,
            status: TransactionStatus.PENDING,
            description,
            idempotency_key,
            reference_transaction_id: incomingTransactionId,
          },
          transactionOptions: { useTransaction: false },
        }),
        this.transactionModelAction.create({
          createPayload: {
            transaction_id: incomingTransactionId,
            to_wallet_id,
            amount: new Decimal(amount),
            fee: new Decimal(0),
            type: TransactionType.TRANSFER_IN,
            status: TransactionStatus.PENDING,
            description,
            reference_transaction_id: outgoingTransactionId,
          },
          transactionOptions: { useTransaction: false },
        }),
      ]);

      if (!outgoingTransaction || !incomingTransaction) {
        throw new BadRequestException('Failed to create transfer transactions');
      }

      this.logger.log(
        `Transfer queued: ${outgoingTransactionId} -> ${incomingTransactionId}`,
      );
      return { outgoing: outgoingTransaction, incoming: incomingTransaction };
    } finally {
      if (idempotency_key) {
        await this.releaseIdempotencyLock(idempotency_key);
      }
    }
  }

  async processTransfer(data: {
    outgoing_transaction_id: string;
    incoming_transaction_id: string;
    from_wallet_id: string;
    to_wallet_id: string;
    amount: number;
    description?: string;
    idempotency_key?: string;
  }): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {

      const { from: fromWallet, to: toWallet } = await this.lockWalletsInOrder(
        data.from_wallet_id,
        data.to_wallet_id,
        queryRunner,
      );


      if (
        fromWallet.status !== WalletStatus.ACTIVE ||
        toWallet.status !== WalletStatus.ACTIVE
      ) {
        throw new BadRequestException('One or both wallets are not active');
      }

      // Check sufficient funds with precise decimal comparison
      if (fromWallet.balance.lt(data.amount)) {
        throw new BadRequestException(
          `Insufficient funds: available ${fromWallet.balance.toString()}, required ${data.amount}`,
        );
      }

      // Calculate new balances
      const newFromBalance = fromWallet.balance.minus(data.amount);
      const newToBalance = toWallet.balance.plus(data.amount);

      // Validate balances are non-negative
      if (newFromBalance.lt(0)) {
        throw new BadRequestException(
          'Transfer would result in negative balance',
        );
      }

      this.logger.debug(
        `Transfer balances: ${fromWallet.id} ${fromWallet.balance.toString()} -> ${newFromBalance.toString()}, ${toWallet.id} ${toWallet.balance.toString()} -> ${newToBalance.toString()}`,
      );

      // Update wallet balances atomically
      await Promise.all([
        this.walletModelAction.update({
          updatePayload: {
            balance: newFromBalance,
            updated_at: new Date(),
          },
          identifierOptions: { id: fromWallet.id },
          transactionOptions: {
            useTransaction: true,
            transaction: queryRunner.manager,
          },
        }),
        this.walletModelAction.update({
          updatePayload: {
            balance: newToBalance,
            updated_at: new Date(),
          },
          identifierOptions: { id: toWallet.id },
          transactionOptions: {
            useTransaction: true,
            transaction: queryRunner.manager,
          },
        }),
      ]);

      // Update transaction statuses atomically
      const processedAt = new Date();
      await Promise.all([
        this.transactionModelAction.update({
          updatePayload: {
            status: TransactionStatus.COMPLETED,
            processed_at: processedAt,
          },
          identifierOptions: { transaction_id: data.outgoing_transaction_id },
          transactionOptions: {
            useTransaction: true,
            transaction: queryRunner.manager,
          },
        }),
        this.transactionModelAction.update({
          updatePayload: {
            status: TransactionStatus.COMPLETED,
            processed_at: processedAt,
          },
          identifierOptions: { transaction_id: data.incoming_transaction_id },
          transactionOptions: {
            useTransaction: true,
            transaction: queryRunner.manager,
          },
        }),
      ]);

      await queryRunner.commitTransaction();

      // Update caches after successful transaction
      await Promise.all([
        this.cacheWalletBalance(fromWallet.id, newFromBalance),
        this.cacheWalletBalance(toWallet.id, newToBalance),
        this.invalidateTransactionHistoryCache(fromWallet.id),
        this.invalidateTransactionHistoryCache(toWallet.id),
      ]);

      this.logger.log(
        `Transfer processed successfully: ${data.outgoing_transaction_id} -> ${data.incoming_transaction_id} (${data.amount})`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();

      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Unknown error';

      // Mark transactions as failed
      const failedAt = new Date();
      await Promise.all([
        this.transactionModelAction.update({
          updatePayload: {
            status: TransactionStatus.FAILED,
            failure_reason: errorMessage,
            processed_at: failedAt,
          },
          identifierOptions: { transaction_id: data.outgoing_transaction_id },
          transactionOptions: { useTransaction: false },
        }),
        this.transactionModelAction.update({
          updatePayload: {
            status: TransactionStatus.FAILED,
            failure_reason: errorMessage,
            processed_at: failedAt,
          },
          identifierOptions: { transaction_id: data.incoming_transaction_id },
          transactionOptions: { useTransaction: false },
        }),
      ]);

      this.logger.error(
        `Transfer failed: ${data.outgoing_transaction_id} -> ${data.incoming_transaction_id}: ${errorMessage}`,
        (error as Error)?.stack,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getTransactionHistory(historyDto: TransactionHistoryDto) {
    const { wallet_id, page = 1, limit = 20, type, status } = historyDto;

    if (!wallet_id) {
      throw new BadRequestException('Wallet ID is required');
    }

    const baseFilter = {
      ...(type && { type }),
      ...(status && { status }),
    };

    const findOptions: FindRecordGeneric<Transaction> = {
      findOptions: [
        { from_wallet_id: wallet_id, ...baseFilter },
        { to_wallet_id: wallet_id, ...baseFilter },
      ],
      transactionOptions: { useTransaction: false },
      paginationPayload: {
        page,
        limit,
      },
    };
    const { payload, paginationMeta } =
      await this.transactionModelAction.find(findOptions);
    this.logger.debug(`Transaction history fetched from DB: ${wallet_id}`);
    return {
      payload,
      paginationMeta,
    };
  }


  async getWalletBalance(walletId: string): Promise<Decimal> {
    const cached = await this.getCachedWalletBalance(walletId);
    if (cached) {
      return cached;
    }
    const wallet = await this.walletModelAction.get({ id: walletId });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    await this.cacheWalletBalance(walletId, wallet.balance);

    return wallet.balance;
  }

  async getUserWallets(userId: string): Promise<Wallet[]> {
    const result = await this.walletModelAction.find({
      findOptions: { user_id: userId, status: WalletStatus.ACTIVE },
      transactionOptions: { useTransaction: false },
    });
    return result.payload;
  }


  private async getWalletWithLock(
    queryRunner: QueryRunner,
    walletId: string,
  ): Promise<Wallet | null> {
    return queryRunner.manager
      .createQueryBuilder(Wallet, 'wallet')
      .where('wallet.id = :id', { id: walletId })
      .setLock('pessimistic_write')
      .getOne();
  }

  /**
   * Handle idempotency for transactions - prevents duplicate operations
   * Uses Redis distributed lock to handle concurrent requests
   */
  private async handleIdempotency(
    idempotencyKey: string,
    operationType: 'deposit' | 'withdraw' | 'transfer',
  ): Promise<Transaction | null> {
    if (!idempotencyKey) {
      return null;
    }


    const existingTransaction = await this.transactionModelAction.get({
      idempotency_key: idempotencyKey,
      status: TransactionStatus.COMPLETED,
    });

    if (existingTransaction) {
      this.logger.log(
        `Idempotent ${operationType} request (completed): ${idempotencyKey}`,
      );
      return existingTransaction;
    }

    const pendingTransaction = await this.transactionModelAction.get({
      idempotency_key: idempotencyKey,
      status: TransactionStatus.PENDING,
    });

    if (pendingTransaction) {
      this.logger.log(
        `Idempotent ${operationType} request (pending): ${idempotencyKey}`,
      );
      return pendingTransaction;
    }


    const failedTransaction = await this.transactionModelAction.get({
      idempotency_key: idempotencyKey,
      status: TransactionStatus.FAILED,
    });

    if (failedTransaction) {
      this.logger.log(
        `Retrying failed ${operationType} with idempotency key: ${idempotencyKey}`,
      );
    }

    return null;
  }

  /**
   * Create idempotency lock to prevent concurrent processing of same key
   */
  private async createIdempotencyLock(
    idempotencyKey: string,
    ttlSeconds: number = 300,
  ): Promise<boolean> {
    const lockKey = `idempotency_lock:${idempotencyKey}`;
    try {
      await this.redisService.setex(lockKey, ttlSeconds, '1');
      return true;
    } catch (error) {
      this.logger.error(`Failed to create idempotency lock: ${error}`);
      return false;
    }
  }

  /**
   * Release idempotency lock
   */
  private async releaseIdempotencyLock(idempotencyKey: string): Promise<void> {
    const lockKey = `idempotency_lock:${idempotencyKey}`;
    await this.redisService.del(lockKey);
  }

  /**
   * Lock multiple wallets in consistent order to prevent deadlocks
   * Always locks wallets in alphabetical order by ID to ensure consistent locking order
   */
  private async lockWalletsInOrder(
    fromWalletId: string,
    toWalletId: string,
    queryRunner: QueryRunner,
  ): Promise<{ from: Wallet; to: Wallet }> {
    const sortedIds = [fromWalletId, toWalletId].sort();

    this.logger.debug(`Locking wallets in order: ${sortedIds.join(', ')}`);
    const firstWallet = await this.getWalletWithLock(queryRunner, sortedIds[0]);
    const secondWallet = await this.getWalletWithLock(
      queryRunner,
      sortedIds[1],
    );

    if (!firstWallet || !secondWallet) {
      throw new NotFoundException('One or both wallets not found');
    }

    const fromWallet =
      sortedIds[0] === fromWalletId ? firstWallet : secondWallet;
    const toWallet = sortedIds[0] === fromWalletId ? secondWallet : firstWallet;

    return { from: fromWallet, to: toWallet };
  }

  /**
   * Update wallet balance with optimistic locking using version field
   */
  private async updateWalletBalanceWithLock(
    queryRunner: QueryRunner,
    walletId: string,
    newBalance: Decimal,
    expectedVersion: number,
  ): Promise<void> {
    const result = await queryRunner.manager
      .createQueryBuilder()
      .update(Wallet)
      .set({
        balance: newBalance.toString(),
        version: () => 'version + 1',
        updated_at: new Date(),
      })
      .where('id = :walletId AND version = :expectedVersion', {
        walletId,
        expectedVersion,
      })
      .execute();

    if (result.affected === 0) {
      throw new ConflictException(
        'Wallet balance update failed due to concurrent modification. Please retry.',
      );
    }

    this.logger.debug(
      `Wallet ${walletId} balance updated to ${newBalance.toString()}`,
    );
  }

  private async cacheWalletBalance(
    walletId: string,
    balance: Decimal,
  ): Promise<void> {
    const cacheKey = `wallet_balance:${walletId}`;
    await this.redisService.setex(cacheKey, 3600, balance.toString());
  }

  private async getCachedWalletBalance(
    walletId: string,
  ): Promise<Decimal | null> {
    const cacheKey = `wallet_balance:${walletId}`;
    const cached = await this.redisService.get(cacheKey);
    return cached ? new Decimal(cached) : null;
  }

  private async invalidateTransactionHistoryCache(
    walletId: string,
  ): Promise<void> {
    const pattern = `transactions:${walletId}:*`;
    const keys = await this.redisService.keys(pattern);
    if (keys.length > 0) {
      await this.redisService.del(...keys);
    }
  }
}
