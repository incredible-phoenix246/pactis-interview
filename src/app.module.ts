import { AppService } from './app.service';
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


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 10 }],
      errorMessage: SYS_MSG.RATE_LIMIT_EXCEEDED,
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ConfigService,
    Logger,
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
