import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { DataSourceLogger } from './data-source.logger';
import { User } from './entities/user.entity';
import { AuditLog } from './entities/audit-log.entity';
import { QueueJob } from './entities/queue-job.entity';
import { Transaction } from './entities/transaction.entity';
import { Wallet } from './entities/wallet.entity';
import { WalletLock } from './entities/wallet-locks.entity';
config();

const configService = new ConfigService();

export const dataSource = new DataSource({
  type: 'postgres',
  username: configService.get<string>('DB_USERNAME'),
  password: configService.get<string>('DB_PASSWORD'),
  host: configService.get<string>('DB_HOST'),
  port: configService.get<number>('DB_PORT'),
  database: configService.get<string>('DB_NAME'),
  entities: [User, AuditLog, QueueJob, Transaction, Wallet, WalletLock],
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: configService.get<boolean>('DB_SYNCHRONIZE'),
  migrationsTableName: 'migrations',
  ssl: configService.get<string>('DB_SSL') === 'true' ? true : false,
  logging: configService.get<boolean>('NODE_ENV') || false,
  logger:
    configService.get<boolean>('NODE_ENV') === true
      ? new DataSourceLogger('DataSource')
      : undefined,
});
