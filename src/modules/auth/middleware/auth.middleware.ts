import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { Request, Response, NextFunction } from 'express';

import type { User } from '@database/entities/user.entity';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';
import { UserModelAction } from '@actions/index';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly userModelAction: UserModelAction,
  ) {}

  async use(req: Request & { user?: User }, res: Response, next: NextFunction) {
    const token = this.extractTokenFromHeader(req);

    if (token) {
      try {
        const payload = this.jwtService.verify<JwtPayload>(token);
        const user = await this.userModelAction.get({ id: payload.sub });

        if (user && user.is_active) {
          req.user = user;
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        // Token is invalid, but we don't throw error here
        // Let the guard handle it for protected routes
      }
    }

    next();
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return undefined;
    }

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
