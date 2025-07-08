import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min, IsUUID } from 'class-validator';

export class WithdrawDto {
  @ApiProperty({
    description: 'Wallet ID to withdraw funds from',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID(4, { message: 'Wallet ID must be a valid UUID' })
  wallet_id: string;

  @ApiProperty({
    description: 'Amount to withdraw',
    example: 50.25,
    minimum: 0.01,
  })
  @IsNumber(
    { maxDecimalPlaces: 8 },
    { message: 'Amount must be a valid number with max 8 decimal places' },
  )
  @Min(0.01, { message: 'Amount must be greater than 0' })
  amount: number;

  @ApiProperty({
    description: 'Optional description for the withdrawal',
    example: 'ATM withdrawal',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Idempotency key to prevent duplicate withdrawals',
    example: 'withdraw_123456789',
    required: false,
  })
  @IsOptional()
  @IsString()
  idempotency_key?: string;
}
