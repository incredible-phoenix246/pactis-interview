import { EntityManager } from 'typeorm';

type DeleteRecordGeneric<IdentifierOptions> = {
  identifierOptions: IdentifierOptions;
  transactionOptions:
    | {
        useTransaction: false;
      }
    | {
        useTransaction: true;
        transaction: EntityManager;
      };
};

export default DeleteRecordGeneric;
