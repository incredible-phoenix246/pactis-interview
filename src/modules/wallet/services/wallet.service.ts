/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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
      const existingTransaction = await this.transactionModelAction.get({
        idempotency_key,
        status: TransactionStatus.COMPLETED,
      });

      if (existingTransaction) {
        this.logger.log(`Idempotent deposit request: ${idempotency_key}`);
        return existingTransaction;
      }
    }


    const transactionId = uuidv4();
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
    if (idempotency_key) {
      const existingTransaction = await this.transactionModelAction.get({
        idempotency_key,
        status: TransactionStatus.COMPLETED,
      });

      if (existingTransaction) {
        this.logger.log(`Idempotent withdraw request: ${idempotency_key}`);
        return existingTransaction;
      }
    }

    const cachedBalance = await this.getCachedWalletBalance(wallet_id);
    if (cachedBalance && cachedBalance.lt(amount)) {
      throw new BadRequestException('Insufficient funds');
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
      throw new BadRequestException('Failed to create withdrawal transaction');
    }

    this.logger.log(`Withdrawal queued: ${transactionId}`);
    return transaction;
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
          failure_reason: typeof error === 'object' && error !== null && 'message' in error
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

    // Check for idempotency
    const existingTransaction = await this.transactionModelAction.get({
      idempotency_key,
      status: TransactionStatus.COMPLETED,
    });

    if (existingTransaction) {
      // Find the paired transaction
      const pairedTransaction = await this.transactionModelAction.get({
        reference_transaction_id: existingTransaction.id,
      });

      this.logger.log(`Idempotent transfer request: ${idempotency_key}`);
      return {
        outgoing: existingTransaction,
        incoming: pairedTransaction || existingTransaction,
      };
    }

    // Pre-check source wallet balance
    const cachedBalance = await this.getCachedWalletBalance(from_wallet_id);
    if (cachedBalance && cachedBalance.lt(amount)) {
      throw new BadRequestException('Insufficient funds');
    }

    // Queue the transfer for async processing
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

    // Create pending transactions
    const outgoingTransaction = await this.transactionModelAction.create({
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
    });

    const incomingTransaction = await this.transactionModelAction.create({
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
    });

    if (!outgoingTransaction || !incomingTransaction) {
      throw new BadRequestException('Failed to create transfer transactions');
    }

    this.logger.log(
      `Transfer queued: ${outgoingTransactionId} -> ${incomingTransactionId}`,
    );
    return { outgoing: outgoingTransaction, incoming: incomingTransaction };
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
      // Get wallets with pessimistic lock (ordered by ID to prevent deadlock)
      const walletIds = [data.from_wallet_id, data.to_wallet_id].sort();
      const wallets = await Promise.all(
        walletIds.map((id) => this.getWalletWithLock(queryRunner, id)),
      );

      const fromWallet = wallets.find((w) => w?.id === data.from_wallet_id);
      const toWallet = wallets.find((w) => w?.id === data.to_wallet_id);

      if (!fromWallet || !toWallet) {
        throw new NotFoundException('One or both wallets not found');
      }

      if (
        fromWallet.status !== WalletStatus.ACTIVE ||
        toWallet.status !== WalletStatus.ACTIVE
      ) {
        throw new BadRequestException('One or both wallets are not active');
      }

      // Check sufficient funds
      if (fromWallet.balance.lt(data.amount)) {
        throw new BadRequestException('Insufficient funds');
      }

      // Update wallet balances
      const newFromBalance = fromWallet.balance.minus(data.amount);
      const newToBalance = toWallet.balance.plus(data.amount);

      await Promise.all([
        this.walletModelAction.update({
          updatePayload: { balance: newFromBalance },
          identifierOptions: { id: fromWallet.id },
          transactionOptions: {
            useTransaction: true,
            transaction: queryRunner.manager,
          },
        }),
        this.walletModelAction.update({
          updatePayload: { balance: newToBalance },
          identifierOptions: { id: toWallet.id },
          transactionOptions: {
            useTransaction: true,
            transaction: queryRunner.manager,
          },
        }),
      ]);

      // Update transaction statuses
      await Promise.all([
        this.transactionModelAction.update({
          updatePayload: {
            status: TransactionStatus.COMPLETED,
            processed_at: new Date(),
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
            processed_at: new Date(),
          },
          identifierOptions: { transaction_id: data.incoming_transaction_id },
          transactionOptions: {
            useTransaction: true,
            transaction: queryRunner.manager,
          },
        }),
      ]);

      await queryRunner.commitTransaction();

      // Update caches
      await Promise.all([
        this.cacheWalletBalance(fromWallet.id, newFromBalance),
        this.cacheWalletBalance(toWallet.id, newToBalance),
        this.invalidateTransactionHistoryCache(fromWallet.id),
        this.invalidateTransactionHistoryCache(toWallet.id),
      ]);

      this.logger.log(
        `Transfer processed: ${data.outgoing_transaction_id} -> ${data.incoming_transaction_id}`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // Mark transactions as failed
      await Promise.all([
        this.transactionModelAction.update({
          updatePayload: {
            status: TransactionStatus.FAILED,
            failure_reason: error.message,
            processed_at: new Date(),
          },
          identifierOptions: { transaction_id: data.outgoing_transaction_id },
          transactionOptions: { useTransaction: false },
        }),
        this.transactionModelAction.update({
          updatePayload: {
            status: TransactionStatus.FAILED,
            failure_reason: error.message,
            processed_at: new Date(),
          },
          identifierOptions: { transaction_id: data.incoming_transaction_id },
          transactionOptions: { useTransaction: false },
        }),
      ]);

      this.logger.error(
        `Transfer failed: ${data.outgoing_transaction_id}`,
        error.stack,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getTransactionHistory(historyDto: TransactionHistoryDto) {
    const { wallet_id, page = 1, limit = 20, type, status } = historyDto;
    const cacheKey = `transactions:${wallet_id}:${page}:${limit}:${type || 'all'}:${status || 'all'}`;
    const cached = await this.redisService.get(cacheKey);

    if (cached) {
      this.logger.debug(`Transaction history cache hit: ${wallet_id}`);
      return JSON.parse(cached);
    }

    // Build filter options
    const filterOptions: any = {
      $or: [{ from_wallet_id: wallet_id }, { to_wallet_id: wallet_id }],
    };

    if (type) {
      filterOptions.type = type;
    }

    if (status) {
      filterOptions.status = status;
    }

    // Get from database
    const result = await this.transactionModelAction.find({
      findOptions: filterOptions,
      paginationPayload: { page, limit },
      order: { created_at: 'DESC' },
      transactionOptions: { useTransaction: false },
    });

    // Cache the result for 5 minutes
    await this.redisService.setex(cacheKey, 300, JSON.stringify(result));

    this.logger.debug(`Transaction history fetched from DB: ${wallet_id}`);
    return result;
  }

  async getWalletBalance(walletId: string): Promise<Decimal> {
    // Try cache first
    const cached = await this.getCachedWalletBalance(walletId);
    if (cached) {
      return cached;
    }

    // Get from database
    const wallet = await this.walletModelAction.get({ id: walletId });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // Cache the balance
    await this.cacheWalletBalance(walletId, wallet.balance);

    return wallet.balance;
  }

  async getUserWallets(userId: string): Promise<Wallet[]> {
    const cacheKey = `user_wallets:${userId}`;
    const cached = await this.redisService.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const result = await this.walletModelAction.find({
      findOptions: { user_id: userId, status: WalletStatus.ACTIVE },
      transactionOptions: { useTransaction: false },
    });

    // Cache for 10 minutes
    await this.redisService.setex(
      cacheKey,
      600,
      JSON.stringify(result.payload),
    );

    return result.payload;
  }

  // Private helper methods
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

  private async cacheWalletBalance(
    walletId: string,
    balance: Decimal,
  ): Promise<void> {
    const cacheKey = `wallet_balance:${walletId}`;
    await this.redisService.setex(cacheKey, 3600, balance.toString()); // Cache for 1 hour
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
