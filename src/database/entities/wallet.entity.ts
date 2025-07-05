import {
  Entity,
  Column,
  Index,
  OneToMany,
  Check,
  VersionColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import Decimal from 'decimal.js';
import { User } from './user.entity';
import { WalletStatus } from '@definitions/enums';
import { Transaction } from './transaction.entity';
import { AbstractBaseEntity } from '../base-entity';
import { DecimalTransformer } from '@helpers/decemial-transformer';

@Entity('wallets')
@Index(['user_id'])
@Index(['status'])
@Index(['created_at'])
@Check(`balance >= 0`)
export class Wallet extends AbstractBaseEntity {
  @Column({ type: 'uuid', name: 'user_id' })
  user_id: string;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 8,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  balance: Decimal;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 8,
    default: 0,
    name: 'frozen_balance',
    transformer: new DecimalTransformer(),
  })
  frozen_balance: Decimal;

  @Column({
    type: 'enum',
    enum: WalletStatus,
    default: WalletStatus.ACTIVE,
  })
  status: WalletStatus;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @VersionColumn()
  version: number;

  @ManyToOne(() => User, (user) => user.wallets)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => Transaction, (transaction) => transaction.from_wallet)
  outgoing_transactions: Transaction[];

  @OneToMany(() => Transaction, (transaction) => transaction.to_wallet)
  incoming_transactions: Transaction[];
}
