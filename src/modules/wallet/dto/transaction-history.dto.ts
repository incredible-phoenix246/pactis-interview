import {
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsEnum,
  IsUUID,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TransactionType, TransactionStatus } from '@definitions/enums';

export class TransactionHistoryDto {
  @ApiProperty({
    description: 'Wallet ID to get transaction history for',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID(4, { message: 'Wallet ID must be a valid UUID' })
  wallet_id: string;

  @ApiProperty({
    description: 'Page number for pagination',
    example: 1,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Page must be a number' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Limit must be a number' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit?: number = 20;

  @ApiProperty({
    description: 'Filter by transaction type',
    enum: TransactionType,
    required: false,
  })
  @IsOptional()
  @IsEnum(TransactionType, { message: 'Invalid transaction type' })
  type?: TransactionType;

  @ApiProperty({
    description: 'Filter by transaction status',
    enum: TransactionStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(TransactionStatus, { message: 'Invalid transaction status' })
  status?: TransactionStatus;
}
