import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import camelToSnake from '@helpers/camel-to-snake-case';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (response.headersSent) {
      this.logger.warn('Headers already sent, cannot send error response');
      return;
    }

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorMessage = 'Internal server error';
    let errorName = 'InternalServerError';
    let errorDetails: Record<string, any> | undefined = undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const errorResponse = exception.getResponse();

      if (typeof errorResponse === 'object' && errorResponse !== null) {
        const typedErrorResponse = errorResponse as {
          error?: string;
          message?: string;
          errors?: any;
        };
        errorName = typedErrorResponse.error || exception.name;
        errorMessage = typedErrorResponse.message || exception.message;
        errorDetails = typedErrorResponse.errors as Record<string, any>;
      } else if (typeof errorResponse === 'string') {
        errorMessage = errorResponse;
      }
    } else if (exception instanceof Error) {
      errorName = exception.name;
      errorMessage = exception.message;

      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(`Unhandled exception: ${String(exception)}`);
    }

    const responseBody = camelToSnake({
      status_code: statusCode,
      message: errorMessage,
      error: errorName,
      errors: errorDetails,
      path: request.url,
      timestamp: new Date().toISOString(),
    });

    response.status(statusCode).json(responseBody);
  }
}
