import {
  Entity,
  Column,
  Index,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type Decimal from 'decimal.js';
import { Wallet } from './wallet.entity';
import { QueueJob } from './queue-job.entity';
import { AbstractBaseEntity } from '../base-entity';
import { DecimalTransformer } from '@helpers/decemial-transformer';
import { TransactionStatus, TransactionType } from '@definitions/enums';

@Entity('transactions')
@Index(['from_wallet_id'])
@Index(['to_wallet_id'])
@Index(['type'])
@Index(['status'])
@Index(['created_at'])
@Index(['transaction_id'], { unique: true })
@Index(['idempotency_key'], {
  unique: true,
  where: 'idempotency_key IS NOT NULL',
})
@Index(['from_wallet_id', 'created_at'])
@Index(['to_wallet_id', 'created_at'])
@Index(['status', 'created_at'])
@Index(['type', 'status'])
@Index(['status', 'created_at'], {
  where: "status IN ('PENDING', 'PROCESSING')",
})
export class Transaction extends AbstractBaseEntity {
  @Column({
    type: 'varchar',
    length: 100,
    unique: true,
    name: 'transaction_id',
  })
  transaction_id: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'idempotency_key',
  })
  idempotency_key: string;

  @Column({ type: 'uuid', nullable: true, name: 'from_wallet_id' })
  from_wallet_id: string;

  @Column({ type: 'uuid', nullable: true, name: 'to_wallet_id' })
  to_wallet_id: string;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 8,
    transformer: new DecimalTransformer(),
  })
  amount: Decimal;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  fee: Decimal;

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'jsonb', nullable: true }) // Using JSONB for better performance
  metadata: Record<string, any>;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'failure_reason',
  })
  failure_reason: string;

  @Column({ type: 'int', default: 0, name: 'retry_count' })
  retry_count: number;

  @Column({ type: 'timestamp', nullable: true, name: 'processed_at' })
  processed_at: Date;

  // Reference transaction for linking TRANSFER_IN and TRANSFER_OUT
  @Column({
    type: 'uuid',
    nullable: true,
    name: 'reference_transaction_id',
  })
  reference_transaction_id: string;

  // Exchange rate for multi-currency support (future)
  @Column({
    type: 'decimal',
    precision: 18,
    scale: 8,
    nullable: true,
    name: 'exchange_rate',
    transformer: new DecimalTransformer(),
  })
  exchange_rate: Decimal;

  @ManyToOne(() => Wallet, (wallet) => wallet.outgoing_transactions)
  @JoinColumn({ name: 'from_wallet_id' })
  from_wallet: Wallet;

  @ManyToOne(() => Wallet, (wallet) => wallet.incoming_transactions)
  @JoinColumn({ name: 'to_wallet_id' })
  to_wallet: Wallet;

  @OneToMany(() => QueueJob, (queueJob) => queueJob.transaction)
  queue_jobs: QueueJob[];
}
