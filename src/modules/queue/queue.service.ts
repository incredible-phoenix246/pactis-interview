import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

export interface DepositJobData {
  transaction_id: string;
  wallet_id: string;
  amount: number;
  description?: string;
  idempotency_key?: string;
}

export interface WithdrawJobData {
  transaction_id: string;
  wallet_id: string;
  amount: number;
  description?: string;
  idempotency_key?: string;
}

export interface TransferJobData {
  outgoing_transaction_id: string;
  incoming_transaction_id: string;
  from_wallet_id: string;
  to_wallet_id: string;
  amount: number;
  description?: string;
  idempotency_key?: string;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('wallet-transactions') private readonly transactionQueue: Queue,
  ) {}

  async addDepositJob(data: DepositJobData): Promise<void> {
    try {
      await this.transactionQueue.add('deposit', data, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      });

      this.logger.log(`Deposit job added: ${data.transaction_id}`);
    } catch (error) {
      this.logger.error(
        `Failed to add deposit job: ${data.transaction_id}`,
        error.stack,
      );
      throw error;
    }
  }

  async addWithdrawJob(data: WithdrawJobData): Promise<void> {
    try {
      await this.transactionQueue.add('withdraw', data, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      });

      this.logger.log(`Withdraw job added: ${data.transaction_id}`);
    } catch (error) {
      this.logger.error(
        `Failed to add withdraw job: ${data.transaction_id}`,
        error.stack,
      );
      throw error;
    }
  }

  async addTransferJob(data: TransferJobData): Promise<void> {
    try {
      await this.transactionQueue.add('transfer', data, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      });

      this.logger.log(`Transfer job added: ${data.outgoing_transaction_id}`);
    } catch (error) {
      this.logger.error(
        `Failed to add transfer job: ${data.outgoing_transaction_id}`,
        error.stack,
      );
      throw error;
    }
  }
}
