import { Test, type TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UserModelAction } from '@database/model-actions/user.model-action';
import { IS_PUBLIC_KEY } from '@decorators/public.decorator';
import { jest } from '@jest/globals';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: jest.Mocked<JwtService>;
  let userModelAction: jest.Mocked<UserModelAction>;
  let reflector: jest.Mocked<Reflector>;

  const mockUser = {
    id: 'user-id',
    email: 'test@example.com',
    is_active: true,
    locked_until: null,
  };

  const mockRequest = {
    headers: {
      authorization: 'Bearer valid-token',
    },
  };

  const mockExecutionContext = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn(() => ({
      getRequest: jest.fn(() => mockRequest),
    })),
  } as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn(),
          },
        },
        {
          provide: UserModelAction,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
    jwtService = module.get(JwtService);
    userModelAction = module.get(UserModelAction);
    reflector = module.get(Reflector);
  });

  it('should allow access to public routes', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    const result = await guard.canActivate(mockExecutionContext);

    expect(result).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      mockExecutionContext.getHandler(),
      mockExecutionContext.getClass(),
    ]);
  });

  it('should allow access with valid token and active user', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtService.verify.mockReturnValue({
      sub: mockUser.id,
      email: mockUser.email,
    } as any);
    userModelAction.get.mockResolvedValue(mockUser as any);

    const result = await guard.canActivate(mockExecutionContext);

    expect(result).toBe(true);
    expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
    expect(userModelAction.get).toHaveBeenCalledWith({ id: mockUser.id });
  });

  it('should throw UnauthorizedException when no token provided', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const requestWithoutToken = { headers: {} };
    const contextWithoutToken = {
      ...mockExecutionContext,
      switchToHttp: jest.fn(() => ({
        getRequest: jest.fn(() => requestWithoutToken),
      })),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(contextWithoutToken)).rejects.toThrow(
      new UnauthorizedException('Access token is required'),
    );
  });

  it('should throw UnauthorizedException when user not found', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtService.verify.mockReturnValue({
      sub: 'non-existent-user',
      email: 'test@example.com',
    } as any);
    userModelAction.get.mockResolvedValue(null);

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
      new UnauthorizedException('User not found'),
    );
  });

  it('should throw UnauthorizedException when user is inactive', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtService.verify.mockReturnValue({
      sub: mockUser.id,
      email: mockUser.email,
    } as any);
    userModelAction.get.mockResolvedValue({
      ...mockUser,
      is_active: false,
    } as any);

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
      new UnauthorizedException('User account is inactive'),
    );
  });

  it('should throw UnauthorizedException when account is locked', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtService.verify.mockReturnValue({
      sub: mockUser.id,
      email: mockUser.email,
    } as any);
    userModelAction.get.mockResolvedValue({
      ...mockUser,
      locked_until: new Date(Date.now() + 60000), // Locked for 1 minute
    } as any);

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
      new UnauthorizedException('Account is temporarily locked'),
    );
  });

  it('should throw UnauthorizedException for expired token', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const error = new Error('Token expired');
    error.name = 'TokenExpiredError';
    jwtService.verify.mockImplementation(() => {
      throw error;
    });

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
      new UnauthorizedException('Token has expired'),
    );
  });

  it('should throw UnauthorizedException for invalid token', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const error = new Error('Invalid token');
    error.name = 'JsonWebTokenError';
    jwtService.verify.mockImplementation(() => {
      throw error;
    });

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
      new UnauthorizedException('Invalid token'),
    );
  });
});
