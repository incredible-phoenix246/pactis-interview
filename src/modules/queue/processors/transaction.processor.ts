import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { WalletService } from '@modules/wallet/services/wallet.service';
import type {
  DepositJobData,
  WithdrawJobData,
  TransferJobData,
} from '../queue.service';

@Processor('wallet-transactions')
export class TransactionProcessor {
  private readonly logger = new Logger(TransactionProcessor.name);

  constructor(private readonly walletService: WalletService) {}

  @Process('deposit')
  async processDeposit(job: Job<DepositJobData>) {
    this.logger.log(`Processing deposit job: ${job.data.transaction_id}`);

    try {
      await this.walletService.processDeposit(job.data);
      this.logger.log(`Deposit job completed: ${job.data.transaction_id}`);
    } catch (error) {
      this.logger.error(
        `Deposit job failed: ${job.data.transaction_id}`,
        error.stack,
      );
      throw error;
    }
  }

  @Process('withdraw')
  async processWithdraw(job: Job<WithdrawJobData>) {
    this.logger.log(`Processing withdraw job: ${job.data.transaction_id}`);

    try {
      await this.walletService.processWithdraw(job.data);
      this.logger.log(`Withdraw job completed: ${job.data.transaction_id}`);
    } catch (error) {
      this.logger.error(
        `Withdraw job failed: ${job.data.transaction_id}`,
        error.stack,
      );
      throw error;
    }
  }

  @Process('transfer')
  async processTransfer(job: Job<TransferJobData>) {
    this.logger.log(
      `Processing transfer job: ${job.data.outgoing_transaction_id}`,
    );

    try {
      await this.walletService.processTransfer(job.data);
      this.logger.log(
        `Transfer job completed: ${job.data.outgoing_transaction_id}`,
      );
    } catch (error) {
      this.logger.error(
        `Transfer job failed: ${job.data.outgoing_transaction_id}`,
        error.stack,
      );
      throw error;
    }
  }
}
