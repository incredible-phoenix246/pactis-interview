import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { User } from '@database/entities/user.entity';
import { WalletStatus } from '@definitions/enums';
import Decimal from 'decimal.js';
import { UserModelAction, WalletModelAction } from '@actions/index';
import { PasswordHelper } from '@helpers/password';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userModelAction: UserModelAction,
    private readonly walletModelAction: WalletModelAction,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async signup(signupDto: SignupDto): Promise<AuthResponseDto> {
    const { email, password, first_name, last_name, phone_number } = signupDto;
    const existingUser = await this.userModelAction.get({ email });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }
    const password_hash = await PasswordHelper.hashPassword(password);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create user
      const user = await this.userModelAction.create({
        createPayload: {
          email,
          first_name,
          last_name,
          phone_number,
          password_hash,
          is_active: true,
          email_verified: false,
        },
        transactionOptions: {
          useTransaction: true,
          transaction: queryRunner.manager,
        },
      });

      if (!user) {
        throw new BadRequestException('Failed to create user');
      }
      await this.walletModelAction.create({
        createPayload: {
          user_id: user.id,
          balance: new Decimal(0),
          frozen_balance: new Decimal(0),
          status: WalletStatus.ACTIVE,
          currency: 'USD',
        },
        transactionOptions: {
          useTransaction: true,
          transaction: queryRunner.manager,
        },
      });

      await queryRunner.commitTransaction();
      const payload: JwtPayload = {
        sub: user.id,
        email: user.email,
        iat: Math.floor(Date.now() / 1000),
      };

      const access_token = this.jwtService.sign(payload);
      const expiresInSeconds = this.getTokenExpirationInSeconds();

      this.logger.log(`User created successfully: ${user.email}`);

      return {
        access_token,
        token_type: 'Bearer',
        expires_in: expiresInSeconds,
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          phone_number: user.phone_number,
          is_active: user.is_active,
          email_verified: user.email_verified,
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      this.logger.error(`Failed to create user: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { email, password } = loginDto;

    // Find user by email
    const user = await this.userModelAction.get({ email });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is active
    if (!user.is_active) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Check if account is locked
    if (user.locked_until && new Date() < user.locked_until) {
      throw new UnauthorizedException('Account is temporarily locked');
    }

    // Verify password
    const isPasswordValid = await PasswordHelper.comparePassword(
      password,
      user.password_hash,
    );

    if (!isPasswordValid) {
      // Increment failed login attempts
      await this.handleFailedLogin(user);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset failed login attempts and update last login
    await this.handleSuccessfulLogin(user);

    // Generate JWT token
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      iat: Math.floor(Date.now() / 1000),
    };

    const access_token = this.jwtService.sign(payload);
    const expiresInSeconds = this.getTokenExpirationInSeconds();

    this.logger.log(`User logged in successfully: ${user.email}`);

    return {
      access_token,
      token_type: 'Bearer',
      expires_in: expiresInSeconds,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        phone_number: user.phone_number,
        is_active: user.is_active,
        email_verified: user.email_verified,
        last_login_at: user.last_login_at,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
    };
  }

  async validateToken(token: string): Promise<User> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      const user = await this.userModelAction.get({ id: payload.sub });

      if (!user || !user.is_active) {
        throw new UnauthorizedException('User not found or inactive');
      }

      return user;
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'name' in error) {
        const errName = (error as { name?: string }).name;
        if (errName === 'TokenExpiredError') {
          throw new UnauthorizedException('Token has expired');
        }
        if (errName === 'JsonWebTokenError') {
          throw new UnauthorizedException('Invalid token');
        }
      }
      throw new UnauthorizedException('Token verification failed');
    }
  }

  refreshToken(user: User): { access_token: string; expires_in: number } {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      iat: Math.floor(Date.now() / 1000),
    };

    const access_token = this.jwtService.sign(payload);
    const expiresInSeconds = this.getTokenExpirationInSeconds();

    return { access_token, expires_in: expiresInSeconds };
  }

  verifyTokenPayload(token: string): JwtPayload {
    try {
      return this.jwtService.verify<JwtPayload>(token);
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'name' in error) {
        const errName = (error as { name?: string }).name;
        if (errName === 'TokenExpiredError') {
          throw new UnauthorizedException('Token has expired');
        }
        if (errName === 'JsonWebTokenError') {
          throw new UnauthorizedException('Invalid token');
        }
      }
      throw new UnauthorizedException('Token verification failed');
    }
  }

  async decodeToken(token: string): Promise<JwtPayload | null> {
    try {
      return this.jwtService.decode(token);
    } catch {
      return null;
    }
  }

  private getTokenExpirationInSeconds(): number {
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '3600s');
    if (expiresIn.endsWith('s')) {
      return Number.parseInt(expiresIn.slice(0, -1));
    } else if (expiresIn.endsWith('m')) {
      return Number.parseInt(expiresIn.slice(0, -1)) * 60;
    } else if (expiresIn.endsWith('h')) {
      return Number.parseInt(expiresIn.slice(0, -1)) * 3600;
    } else if (expiresIn.endsWith('d')) {
      return Number.parseInt(expiresIn.slice(0, -1)) * 86400;
    } else {
      // Assume seconds if no unit
      return Number.parseInt(expiresIn) || 3600;
    }
  }

  private async handleFailedLogin(user: User): Promise<void> {
    const failedAttempts = user.failed_login_attempts + 1;
    const maxAttempts = this.configService.get<number>('MAX_LOGIN_ATTEMPTS', 5);
    const lockDuration = this.configService.get<number>(
      'LOCK_DURATION_MINUTES',
      15,
    );

    let locked_until: Date | undefined = undefined;
    if (failedAttempts >= maxAttempts) {
      locked_until = new Date();
      locked_until.setMinutes(locked_until.getMinutes() + lockDuration);
    }

    await this.userModelAction.update({
      updatePayload: {
        failed_login_attempts: failedAttempts,
        locked_until,
      },
      identifierOptions: { id: user.id },
      transactionOptions: { useTransaction: false },
    });
  }

  private async handleSuccessfulLogin(user: User): Promise<void> {
    await this.userModelAction.update({
      updatePayload: {
        failed_login_attempts: 0,
        locked_until: undefined,
        last_login_at: new Date(),
        last_login_ip: undefined,
      },
      identifierOptions: { id: user.id },
      transactionOptions: { useTransaction: false },
    });
  }
}
