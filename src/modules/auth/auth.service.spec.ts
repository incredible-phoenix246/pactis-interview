import { Test, type TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthService } from './auth.service';
import { UserModelAction } from '@database/model-actions/user.model-action';
import { WalletModelAction } from '@database/model-actions/wallet.model-action';
import { PasswordHelper } from '@helpers/password.helper';
import { WalletStatus } from '@definitions/enums';
import Decimal from 'decimal.js';
import { jest } from '@jest/globals';

describe('AuthService', () => {
  let service: AuthService;
  let userModelAction: jest.Mocked<UserModelAction>;
  let walletModelAction: jest.Mocked<WalletModelAction>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let dataSource: jest.Mocked<DataSource>;

  const mockUser = {
    id: 'user-id',
    email: 'test@example.com',
    first_name: 'John',
    last_name: 'Doe',
    password_hash: 'hashed-password',
    is_active: true,
    email_verified: false,
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      save: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserModelAction,
          useValue: {
            get: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: WalletModelAction,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
            decode: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn(() => mockQueryRunner),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userModelAction = module.get(UserModelAction);
    walletModelAction = module.get(WalletModelAction);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
    dataSource = module.get(DataSource);
  });

  describe('signup', () => {
    const signupDto = {
      email: 'test@example.com',
      password: 'Password123!',
      first_name: 'John',
      last_name: 'Doe',
    };

    it('should create a new user and wallet successfully', async () => {
      userModelAction.get.mockResolvedValue(null); // No existing user
      userModelAction.create.mockResolvedValue(mockUser as any);
      walletModelAction.create.mockResolvedValue({
        id: 'wallet-id',
        user_id: mockUser.id,
        balance: new Decimal(0),
        status: WalletStatus.ACTIVE,
      } as any);
      jwtService.sign.mockReturnValue('jwt-token');
      configService.get.mockReturnValue('3600s');

      jest
        .spyOn(PasswordHelper, 'hashPassword')
        .mockResolvedValue('hashed-password');

      const result = await service.signup(signupDto);

      expect(result).toEqual({
        access_token: 'jwt-token',
        token_type: 'Bearer',
        expires_in: 3600,
        user: expect.objectContaining({
          id: mockUser.id,
          email: mockUser.email,
        }),
      });

      expect(userModelAction.create).toHaveBeenCalledWith({
        createPayload: expect.objectContaining({
          email: signupDto.email,
          password_hash: 'hashed-password',
        }),
        transactionOptions: expect.any(Object),
      });

      expect(walletModelAction.create).toHaveBeenCalled();
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
        iat: expect.any(Number),
      });
    });

    it('should throw ConflictException if user already exists', async () => {
      userModelAction.get.mockResolvedValue(mockUser as any);

      await expect(service.signup(signupDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    it('should login user successfully', async () => {
      userModelAction.get.mockResolvedValue(mockUser as any);
      userModelAction.update.mockResolvedValue(mockUser as any);
      jwtService.sign.mockReturnValue('jwt-token');
      configService.get.mockReturnValue('3600s');

      jest.spyOn(PasswordHelper, 'comparePassword').mockResolvedValue(true);

      const result = await service.login(loginDto);

      expect(result).toEqual({
        access_token: 'jwt-token',
        token_type: 'Bearer',
        expires_in: 3600,
        user: expect.objectContaining({
          id: mockUser.id,
          email: mockUser.email,
        }),
      });

      expect(userModelAction.update).toHaveBeenCalledWith({
        updatePayload: {
          failed_login_attempts: 0,
          locked_until: null,
          last_login_at: expect.any(Date),
          last_login_ip: null,
        },
        identifierOptions: { id: mockUser.id },
        transactionOptions: { useTransaction: false },
      });
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      userModelAction.get.mockResolvedValue(mockUser as any);
      jest.spyOn(PasswordHelper, 'comparePassword').mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('validateToken', () => {
    it('should validate token and return user', async () => {
      const payload = {
        sub: mockUser.id,
        email: mockUser.email,
        iat: Date.now(),
      };
      jwtService.verify.mockReturnValue(payload as any);
      userModelAction.get.mockResolvedValue(mockUser as any);

      const result = await service.validateToken('valid-token');

      expect(result).toEqual(mockUser);
      expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
    });

    it('should throw UnauthorizedException for expired token', async () => {
      const error = new Error('Token expired');
      error.name = 'TokenExpiredError';
      jwtService.verify.mockImplementation(() => {
        throw error;
      });

      await expect(service.validateToken('expired-token')).rejects.toThrow(
        new UnauthorizedException('Token has expired'),
      );
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      const error = new Error('Invalid token');
      error.name = 'JsonWebTokenError';
      jwtService.verify.mockImplementation(() => {
        throw error;
      });

      await expect(service.validateToken('invalid-token')).rejects.toThrow(
        new UnauthorizedException('Invalid token'),
      );
    });
  });

  describe('refreshToken', () => {
    it('should generate new access token', async () => {
      jwtService.sign.mockReturnValue('new-jwt-token');
      configService.get.mockReturnValue('3600s');

      const result = await service.refreshToken(mockUser as any);

      expect(result).toEqual({
        access_token: 'new-jwt-token',
        expires_in: 3600,
      });

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
        iat: expect.any(Number),
      });
    });
  });

  describe('getTokenExpirationInSeconds', () => {
    it('should parse seconds format', () => {
      configService.get.mockReturnValue('3600s');
      const result = service['getTokenExpirationInSeconds']();
      expect(result).toBe(3600);
    });

    it('should parse minutes format', () => {
      configService.get.mockReturnValue('60m');
      const result = service['getTokenExpirationInSeconds']();
      expect(result).toBe(3600);
    });

    it('should parse hours format', () => {
      configService.get.mockReturnValue('1h');
      const result = service['getTokenExpirationInSeconds']();
      expect(result).toBe(3600);
    });

    it('should parse days format', () => {
      configService.get.mockReturnValue('1d');
      const result = service['getTokenExpirationInSeconds']();
      expect(result).toBe(86400);
    });

    it('should default to seconds if no unit', () => {
      configService.get.mockReturnValue('3600');
      const result = service['getTokenExpirationInSeconds']();
      expect(result).toBe(3600);
    });
  });
});
