import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { User } from '@database/entities/user.entity';
import { Wallet } from '@database/entities/wallet.entity';
import { Transaction } from '@database/entities/transaction.entity';
import { QueueJob } from '@database/entities/queue-job.entity';
import { AuditLog } from '@database/entities/audit-log.entity';
import { WalletLock } from '@database/entities/wallet-locks.entity';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserModelAction, WalletModelAction } from '@actions/index';
import { Reflector } from '@nestjs/core';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Wallet,
      Transaction,
      QueueJob,
      AuditLog,
      WalletLock,
    ]),
    TypeOrmModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN') ?? '3600s',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    UserModelAction,
    WalletModelAction,
    Reflector,
    JwtAuthGuard,
  ],
  exports: [AuthService, JwtAuthGuard, JwtModule, UserModelAction],
})
export class AuthModule {}
