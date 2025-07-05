import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import camelToSnake from '@helpers/camel-to-snake-case';
import { IS_PRIVATE_KEY } from '@decorators/private.decorator';
import { PaginationMeta } from '@definitions/interfaces';

interface ResponseData {
  message?: string;
  data?: Record<string, unknown>;
  timestamp?: string;
  meta?: PaginationMeta;
  success: boolean;
}

const DEFAULT_PRIVATE_FIELDS = ['password_hash'];

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ResponseInterceptor.name);

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((res: unknown) => this.responseHandler(res, context)),
      catchError((err: unknown) => {
        const transformedError = this.errorHandler(err, context);
        return throwError(() => transformedError);
      }),
    );
  }

  errorHandler(exception: unknown, context: ExecutionContext): HttpException {
    const req = context.switchToHttp().getRequest<Request>();

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const status = exception.getStatus();

      if (typeof response === 'object') {
        const formattedResponse = camelToSnake({
          message:
            typeof response === 'object' && 'message' in response
              ? response['message']
              : exception.message,
          error:
            typeof response === 'object' && 'error' in response
              ? response['error']
              : undefined,
          timestamp: new Date().toISOString(),
          success: false,
        });

        return new HttpException(formattedResponse, status);
      }

      return new HttpException(
        camelToSnake({
          message: exception.message,
          timestamp: new Date().toISOString(),
          success: false,
        }),
        status,
      );
    }

    const errorMessage =
      exception instanceof Error ? exception.message : 'Unknown error';
    const errorStack = exception instanceof Error ? exception.stack : undefined;

    this.logger.error(
      `Error processing request for ${req.method} ${req.url}, Message: ${errorMessage}, Stack: ${errorStack ?? 'Not available'}`,
    );

    return new InternalServerErrorException(
      camelToSnake({
        message: 'Internal server error',
        error: errorMessage,
        timestamp: new Date().toISOString(),
        success: false,
      }),
    );
  }

  responseHandler(res: unknown, context: ExecutionContext): ResponseData {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse<Response>();
    response.setHeader('Content-Type', 'application/json');

    if (typeof res === 'object' && res !== null) {
      const { message, data, meta } = res as ResponseData;

      const processedData = data
        ? this.removePrivateFields(data, context)
        : undefined;

      return camelToSnake({
        message: message || 'Success',
        data: processedData ? processedData : undefined,
        meta: meta || undefined,
        timestamp: new Date().toISOString(),
        success: true,
      }) as ResponseData;
    }

    return camelToSnake({
      message: 'Success',
      data: res as Record<string, unknown>,
      timestamp: new Date().toISOString(),
      success: true,
    }) as ResponseData;
  }

  private removePrivateFields(
    data: unknown,
    context: ExecutionContext,
  ): unknown {
    if (Array.isArray(data)) {
      return data.map((item) => this.removePrivateFields(item, context));
    }

    if (data === null || typeof data !== 'object') {
      return data;
    }

    const result = { ...data } as Record<string, unknown>;

    const decoratorPrivateFields =
      this.reflector.get<string[]>(IS_PRIVATE_KEY, context.getHandler()) || [];

    const classLevelPrivateFields =
      this.reflector.get<string[]>(IS_PRIVATE_KEY, context.getClass()) || [];

    const privateFields = [
      ...DEFAULT_PRIVATE_FIELDS,
      ...classLevelPrivateFields,
      ...decoratorPrivateFields,
    ];

    const filteredResult: Record<string, unknown> = {};

    Object.keys(result).forEach((key) => {
      if (!privateFields.includes(key)) {
        filteredResult[key] = result[key];
      }
    });

    for (const key in filteredResult) {
      if (
        typeof filteredResult[key] === 'object' &&
        !(filteredResult[key] instanceof Date) &&
        filteredResult[key] !== null
      ) {
        filteredResult[key] = this.removePrivateFields(
          filteredResult[key],
          context,
        );
      }
    }

    return filteredResult;
  }
}
