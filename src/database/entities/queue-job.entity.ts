import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { AbstractBaseEntity } from '../base-entity';
import { QueueJobStatus } from '@definitions/enums';
import { Transaction } from './transaction.entity';

@Entity('queue_jobs')
@Index(['transaction_id'])
@Index(['status'])
@Index(['created_at'])
@Index(['scheduled_at'])
@Index(['job_id'], { unique: true })
export class QueueJob extends AbstractBaseEntity {
  @Column({ type: 'varchar', length: 255, unique: true, name: 'job_id' })
  job_id: string;

  @Column({ type: 'uuid', name: 'transaction_id' })
  transaction_id: string;

  @Column({ type: 'varchar', length: 100, name: 'queue_name' })
  queue_name: string;

  @Column({
    type: 'enum',
    enum: QueueJobStatus,
    default: QueueJobStatus.PENDING,
  })
  status: QueueJobStatus;

  @Column({ type: 'json', nullable: true, name: 'job_data' })
  job_data: Record<
    string,
    string | number | boolean | object | string[] | number[] | null
  >;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'int', default: 3, name: 'max_attempts' })
  max_attempts: number;

  @Column({ type: 'text', nullable: true, name: 'error_message' })
  error_message: string;

  @Column({ type: 'timestamp', nullable: true, name: 'scheduled_at' })
  scheduled_at: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'processed_at' })
  processed_at: Date;

  @ManyToOne(() => Transaction, (transaction) => transaction.queue_jobs)
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction;
}
