import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { Wallet } from './wallet.entity';
import { AbstractBaseEntity } from '../base-entity';

@Entity('audit_logs')
@Index(['wallet_id'])
@Index(['action'])
@Index(['created_at'])
@Index(['user_id'])
export class AuditLog extends AbstractBaseEntity {
  @Column({ type: 'uuid', name: 'wallet_id' })
  wallet_id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  user_id: string;

  @Column({ type: 'varchar', length: 100 })
  action: string; // 'CREATE_WALLET', 'DEPOSIT', 'WITHDRAW', 'TRANSFER', etc.

  @Column({ type: 'json', name: 'old_data' })
  old_data: Record<string, any>;

  @Column({ type: 'json', name: 'new_data' })
  new_data: Record<string, any>;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'transaction_id',
  })
  transaction_id: string;

  @Column({ type: 'inet', nullable: true, name: 'ip_address' })
  ip_address: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'user_agent' })
  user_agent: string;

  @ManyToOne(() => Wallet)
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
