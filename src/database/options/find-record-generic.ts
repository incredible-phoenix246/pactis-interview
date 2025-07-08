import { EntityManager } from 'typeorm';

type FindRecordGeneric<WhereOptions> = {
  findOptions: WhereOptions;
  transactionOptions:
    | {
        useTransaction: false;
      }
    | {
        useTransaction: true;
        transaction: EntityManager;
      };
  paginationPayload?: {
    limit: number;
    page: number;
  };
  order?: Record<string, 'ASC' | 'DESC'>;
};

export default FindRecordGeneric;
