import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';
import { TransactionProcessor } from './processors/transaction.processor';
import { WalletModule } from '@modules/wallet/wallet.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD'),
          db: configService.get<number>('REDIS_QUEUE_DB', 1),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'wallet-transactions',
    }),
    forwardRef(() => WalletModule),
  ],
  providers: [QueueService, TransactionProcessor],
  exports: [QueueService],
})
export class QueueModule {}
