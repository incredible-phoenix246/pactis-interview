import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

@Injectable()
export class ErrorLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ErrorLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req: Request = context.switchToHttp().getRequest();
    const method = req.method;
    const url = req.url;
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const responseTime = Date.now() - now;
        if (responseTime > 1000) {
          this.logger.warn(`Request ${method} ${url} took ${responseTime}ms`);
        }
      }),
      catchError((error: Error) => {
        const response: Response = context.switchToHttp().getResponse();
        const responseTime = Date.now() - now;

        this.logger.error(
          `Request ${method} ${url} failed after ${responseTime}ms`,
          error.stack,
        );
        if (!response.headersSent) {
          return throwError(() => error);
        } else {
          return throwError(
            () => new Error('Headers already sent, cannot modify response'),
          );
        }
      }),
    );
  }
}
