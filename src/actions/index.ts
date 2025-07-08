// @ts-check
import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '@database/entities/user.entity';
import { Wallet } from '@database/entities/wallet.entity';
import { AbstractModelAction } from '@database/abstract-model-action';
import { Transaction } from '@database/entities/transaction.entity';

@Injectable()
export class UserModelAction extends AbstractModelAction<User> {
  constructor(
    @InjectRepository(User)
    repository: Repository<User>,
  ) {
    super(repository, User);
  }
}

@Injectable()
export class WalletModelAction extends AbstractModelAction<Wallet> {
  constructor(
    @InjectRepository(Wallet)
    repository: Repository<Wallet>,
  ) {
    super(repository, Wallet);
  }
}

@Injectable()
export class TransactionModelAction extends AbstractModelAction<Transaction> {
  constructor(
    @InjectRepository(Transaction)
    repository: Repository<Transaction>,
  ) {
    super(repository, Transaction);
  }
}
