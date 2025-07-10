import { EntityManager, FindOptionsWhere } from 'typeorm';

type FindRecordGeneric<Entity> = {
  findOptions: FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[];
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
  order?: Record<keyof Partial<Entity>, 'ASC' | 'DESC'>;
};

export default FindRecordGeneric;
