import { TypeOrmModule } from '@nestjs/typeorm';
import { Module, forwardRef } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './services/wallet.service';
import { Wallet } from '@database/entities/wallet.entity';
import { RedisModule } from '@modules/redis/redis.module';
import { QueueModule } from '@modules/queue/queue.module';
import { AuthModule } from '@modules/auth/auth.module';
import { Transaction } from '@database/entities/transaction.entity';
import { TransactionModelAction, WalletModelAction } from '@actions/index';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, Transaction]),
    RedisModule,
    forwardRef(() => QueueModule),
    AuthModule,
  ],
  controllers: [WalletController],
  providers: [WalletService, WalletModelAction, TransactionModelAction],
  exports: [WalletService, WalletModelAction, TransactionModelAction],
})
export class WalletModule {}
