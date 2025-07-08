import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';

export class CreateWalletDto {
  @ApiProperty({
    description: 'Initial balance for the wallet',
    example: 0,
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 8 },
    {
      message:
        'Initial balance must be a valid number with max 8 decimal places',
    },
  )
  @Min(0, { message: 'Initial balance cannot be negative' })
  @Max(1000000, { message: 'Initial balance cannot exceed 1,000,000' })
  initial_balance?: number = 0;

  @ApiProperty({
    description: 'Currency code for the wallet',
    example: 'USD',
    default: 'USD',
  })
  @IsOptional()
  @IsString()
  currency?: string = 'USD';
}
