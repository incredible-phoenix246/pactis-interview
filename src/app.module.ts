import services from './services/base-service';
import { Logger, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ThrottlerModule } from '@nestjs/throttler';
import * as SYS_MSG from '@helpers/system-messages';
import { LimiterGuard } from './guards/limiter.guard';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { GlobalExceptionFilter } from './exceptions/global-exception.filter';
import { ErrorLoggingInterceptor } from './interceptor/error-logging.interceptor';
import { ValidationExceptionFilter } from './exceptions/validation-exception.filter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '@modules/auth/auth.module';
import { WalletModule } from '@modules/wallet/wallet.module';
import { RedisModule } from '@modules/redis/redis.module';
import { QueueModule } from '@modules/queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 10 }],
      errorMessage: SYS_MSG.RATE_LIMIT_EXCEEDED,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        synchronize: true,
        ssl: config.get<boolean>('DB_SSL') === true,
        autoLoadEntities: true,
      }),
    }),
    AuthModule,
    WalletModule,
    RedisModule,
    QueueModule
  ],
  controllers: [AppController],
  providers: [
    ...services,
    ConfigService,
    Logger,
    // JwtAuthGuard,
    {
      provide: APP_GUARD,
      useClass: LimiterGuard,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useClass: ValidationExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ErrorLoggingInterceptor,
    },
  ],
})
export class AppModule { }
