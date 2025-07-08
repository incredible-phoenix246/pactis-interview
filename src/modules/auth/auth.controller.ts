/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Request,
  Body,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';

import { Public } from '@decorators/public.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { User } from '@database/entities/user.entity';
import { buildResponse } from '@helpers/format-response';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: SignupDto })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation failed',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - user already exists',
  })
  async signup(@Body() signupDto: SignupDto) {
    const result = await this.authService.signup(signupDto);
    return buildResponse(result, 'User registered successfully');
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login user' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged in',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid credentials',
  })
  async login(@Body() loginDto: LoginDto) {
    const result = await this.authService.login(loginDto);
    return buildResponse(result, 'User logged in successfully');
  }

  // @Get("profile")
  // @UseGuards(JwtAuthGuard)
  // @ApiBearerAuth()
  // @ApiOperation({ summary: "Get current user profile" })
  // @ApiResponse({
  //   status: 200,
  //   description: "User profile retrieved successfully",
  //   type: User,
  // })
  // @ApiResponse({
  //   status: 401,
  //   description: "Unauthorized - invalid token",
  // })
  // async getProfile(@Request() req) {
  //   return buildResponse(req.user, "User profile retrieved successfully")
  // }

  // @Post("refresh")
  // @UseGuards(JwtAuthGuard)
  // @ApiBearerAuth()
  // @ApiOperation({ summary: "Refresh access token" })
  // @ApiResponse({
  //   status: 200,
  //   description: "Token refreshed successfully",
  // })
  // @ApiResponse({
  //   status: 401,
  //   description: "Unauthorized - invalid token",
  // })
  // async refreshToken(@Request() req) {
  //   const result = await this.authService.refreshToken(req.user)
  //   return buildResponse(result, "Token refreshed successfully")
  // }
}
