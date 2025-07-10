import {
  DeepPartial,
  EntityTarget,
  FindOptionsOrder,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import ListRecordGeneric from './options/list-record-generic';
import CreateRecordGeneric from './options/create-record-generic';
import DeleteRecordGeneric from './options/delete-record-generic';
import UpdateRecordGeneric from './options/update-record-generic';
import FindRecordGeneric from './options/find-record-generic';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { computePaginationMeta } from '@helpers/pagination.helper';
import { PaginationMeta } from '@definitions/interfaces';

export abstract class AbstractModelAction<T extends ObjectLiteral> {
  model: EntityTarget<T>;

  constructor(
    protected readonly repository: Repository<T>,
    model: EntityTarget<T>,
  ) {
    this.model = model;
  }

  async create(
    createRecordOptions: CreateRecordGeneric<DeepPartial<T>>,
  ): Promise<T | null> {
    const { createPayload, transactionOptions } = createRecordOptions;
    const modelRepository = transactionOptions.useTransaction
      ? transactionOptions.transaction.getRepository(this.model)
      : this.repository;
    const response: T | null = (await modelRepository.save(
      createPayload,
    )) as T | null;
    return response;
  }

  async update(
    updateRecordOptions: UpdateRecordGeneric<
      QueryDeepPartialEntity<T>,
      FindOptionsWhere<T>
    >,
  ) {
    const { updatePayload, identifierOptions, transactionOptions } =
      updateRecordOptions;
    const modelRepository = transactionOptions.useTransaction
      ? transactionOptions.transaction.getRepository(this.model)
      : this.repository;
    await modelRepository.update(identifierOptions, updatePayload);
    return await modelRepository.findOne({ where: identifierOptions });
  }

  async delete(deleteRecordOptions: DeleteRecordGeneric<FindOptionsWhere<T>>) {
    const { identifierOptions, transactionOptions } = deleteRecordOptions;
    const modelRepository = transactionOptions.useTransaction
      ? transactionOptions.transaction.getRepository(this.model)
      : this.repository;
    return await modelRepository.delete(identifierOptions);
  }

  async get(
    getRecordIdentifierOptions: object,
    queryOptions?: object,
    relations?: object,
  ) {
    return await this.repository.findOne({
      where: getRecordIdentifierOptions,
      ...queryOptions,
      relations,
    });
  }

  async find(findRecordOptions: FindRecordGeneric<object>) {
    const { findOptions, transactionOptions, paginationPayload, order } =
      findRecordOptions;

    const modelRepository = transactionOptions.useTransaction
      ? transactionOptions.transaction.getRepository(this.model)
      : this.repository;

    const orderBy: FindOptionsOrder<T> = order
      ? (order as FindOptionsOrder<T>)
      : ({ id: 'DESC' } as unknown as FindOptionsOrder<T>);

    if (paginationPayload) {
      const { limit, page } = paginationPayload;
      const query = await modelRepository.find({
        where: findOptions,
        take: +limit,
        skip: +limit * (+page - 1),
        order: orderBy,
      });
      const total = await modelRepository.count({ where: findOptions });

      return {
        payload: query,
        paginationMeta: computePaginationMeta(total, +limit, +page),
      };
    }

    const query = await modelRepository.find({
      where: findOptions,
      order: orderBy,
    });
    return {
      payload: query,
      paginationMeta: { total: query.length },
    };
  }

  async list(
    listRecordOptions: ListRecordGeneric<object>,
  ): Promise<{ payload: T[]; paginationMeta: Partial<PaginationMeta> }> {
    const { paginationPayload, filterRecordOptions, relations, order } =
      listRecordOptions;
    const orderBy: FindOptionsOrder<T> = order
      ? (order as FindOptionsOrder<T>)
      : ({ id: 'DESC' } as unknown as FindOptionsOrder<T>);
    if (paginationPayload) {
      const { limit, page } = paginationPayload;
      const query = await this.repository.find({
        where: filterRecordOptions,
        relations,
        take: +limit,
        skip: +limit * (+page - 1),
        order: orderBy,
      });
      const total = await this.repository.count({ where: filterRecordOptions });
      return {
        payload: query,
        paginationMeta: computePaginationMeta(total, +limit, +page),
      };
    }
    const query = await this.repository.find({
      where: filterRecordOptions,
      relations,
      order: orderBy,
    });
    return {
      payload: query,
      paginationMeta: { total: query.length },
    };
  }

  // Add method for complex queries
  getQueryBuilder(alias?: string) {
    return this.repository.createQueryBuilder(alias);
  }
}
