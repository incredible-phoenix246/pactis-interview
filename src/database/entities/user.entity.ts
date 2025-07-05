import { Entity, Column, Index, OneToMany } from 'typeorm';
import { AbstractBaseEntity } from '../base-entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Wallet } from './wallet.entity';

@Entity('users')
@Index(['email'], { unique: true })
export class User extends AbstractBaseEntity {
  @ApiProperty({
    description: 'Unique email address of the user',
    example: 'john.doe@example.com',
    format: 'email',
    maxLength: 255,
  })
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @ApiProperty({
    description: 'First name of the user',
    example: 'John',
    maxLength: 100,
  })
  @Column({ type: 'varchar', length: 100, name: 'first_name' })
  first_name: string;

  @ApiProperty({
    description: 'Last name of the user',
    example: 'Doe',
    maxLength: 100,
  })
  @Column({ type: 'varchar', length: 100, name: 'last_name' })
  last_name: string;

  @ApiPropertyOptional({
    description: 'Phone number of the user',
    example: '+1234567890',
    maxLength: 20,
  })
  @Column({ type: 'varchar', length: 20, nullable: true, name: 'phone_number' })
  phone_number: string;

  @ApiProperty({
    description: 'Whether the user account is active',
    example: true,
    default: true,
  })
  @Column({ type: 'boolean', default: true, name: 'is_active' })
  is_active: boolean;

  @ApiProperty({
    description: 'List of wallets owned by the user',
    type: () => [Wallet],
    isArray: true,
  })
  @OneToMany(() => Wallet, (wallet) => wallet.user)
  wallets: Wallet[];
}
