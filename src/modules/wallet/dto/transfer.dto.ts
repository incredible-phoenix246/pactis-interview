import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min, IsUUID } from 'class-validator';

export class TransferDto {
  @ApiProperty({
    description: 'Source wallet ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID(4, { message: 'From wallet ID must be a valid UUID' })
  from_wallet_id: string;

  @ApiProperty({
    description: 'Destination wallet ID',
    example: '987fcdeb-51a2-43d1-9c4f-123456789abc',
  })
  @IsUUID(4, { message: 'To wallet ID must be a valid UUID' })
  to_wallet_id: string;

  @ApiProperty({
    description: 'Amount to transfer',
    example: 75.0,
    minimum: 0.01,
  })
  @IsNumber(
    { maxDecimalPlaces: 8 },
    { message: 'Amount must be a valid number with max 8 decimal places' },
  )
  @Min(0.01, { message: 'Amount must be greater than 0' })
  amount: number;

  @ApiProperty({
    description: 'Optional description for the transfer',
    example: 'Payment for services',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Idempotency key to prevent duplicate transfers',
    example: 'transfer_123456789',
  })
  @IsString()
  idempotency_key: string;
}
