import { Entity, Column, Index, OneToMany } from 'typeorm';
import { AbstractBaseEntity } from '../base-entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Wallet } from './wallet.entity';

@Entity('users')
@Index(['email'], { unique: true })
@Index(['created_at'])
@Index(['is_active'])
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

  @Exclude()
  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  password_hash: string;

  @ApiProperty({
    description: 'Whether the user account is active',
    example: true,
    default: true,
  })
  @Column({ type: 'boolean', default: true, name: 'is_active' })
  is_active: boolean;

  // Email verification
  @Column({ type: 'boolean', default: false, name: 'email_verified' })
  email_verified: boolean;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'email_verification_token',
  })
  email_verification_token: string;

  @Column({ type: 'timestamp', nullable: true, name: 'email_verified_at' })
  email_verified_at: Date;

  // Password reset functionality
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'password_reset_token',
  })
  password_reset_token: string;

  @Column({
    type: 'timestamp',
    nullable: true,
    name: 'password_reset_expires_at',
  })
  password_reset_expires_at: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'last_login_at' })
  last_login_at: Date;

  @Column({ type: 'inet', nullable: true, name: 'last_login_ip' })
  last_login_ip: string;

  @Column({ type: 'int', default: 0, name: 'failed_login_attempts' })
  failed_login_attempts: number;

  @Column({ type: 'timestamp', nullable: true, name: 'locked_until' })
  locked_until: Date;

  @ApiProperty({
    description: 'List of wallets owned by the user',
    type: () => [Wallet],
    isArray: true,
  })
  @OneToMany(() => Wallet, (wallet) => wallet.user)
  wallets: Wallet[];
}
