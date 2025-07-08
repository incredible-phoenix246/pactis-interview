import { EntityManager } from 'typeorm';

type UpdateRecordGeneric<UpdateRecordPayload, IdentifierOptions> = {
  updatePayload: UpdateRecordPayload;
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

export default UpdateRecordGeneric;
