import { User } from '@database/entities/user.entity';

export interface PaginationMeta {
  total: number;
  limit: number;
  page: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  maxAge: number;
}

export interface LoginAttempt {
  ip: string;
  userAgent: string;
  success: boolean;
  timestamp: Date;
}

export interface SecuritySettings {
  maxFailedAttempts: number;
  lockoutDuration: number;
  passwordPolicy: PasswordPolicy;
  requireEmailVerification: boolean;
  sessionTimeout: number;
}

declare module 'express' {
  interface Request {
    user?: User;
  }
}
