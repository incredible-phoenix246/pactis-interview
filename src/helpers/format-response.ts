import { PaginationMeta } from '@definitions/interfaces';

/**
 * Build standardized API response
 * @param data - The payload to include in the response
 * @param message - A descriptive message about the response
 * @returns A formatted response object with data and message
 */
export function buildResponse<T>(
  data: T,
  message: string,
  meta?: PaginationMeta,
): { data: T; message: string; meta?: PaginationMeta } {
  return {
    data,
    message,
    meta,
  };
}
