type ListRecordGeneric<FilterRecordOptions> = {
  filterRecordOptions: FilterRecordOptions;
  relations?: object;
  paginationPayload?: {
    limit: number;
    page: number;
  };
  order?: Record<string, 'ASC' | 'DESC'>;
};

export default ListRecordGeneric;
