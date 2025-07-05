import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Wallet } from './wallet.entity';
import { AbstractBaseEntity } from '../base-entity';

@Entity('wallet_locks')
@Index(['wallet_id'], { unique: true })
@Index(['created_at'])
export class WalletLock extends AbstractBaseEntity {
  @Column({ type: 'uuid', unique: true, name: 'wallet_id' })
  wallet_id: string;

  @Column({ type: 'varchar', length: 255, name: 'lock_type' })
  lock_type: string; // 'TRANSACTION', 'MAINTENANCE', etc.

  @Column({ type: 'varchar', length: 255, name: 'lock_id' })
  lock_id: string; // Unique identifier for the lock

  @Column({ type: 'timestamp', name: 'expires_at' })
  expires_at: Date;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @ManyToOne(() => Wallet)
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;
}
