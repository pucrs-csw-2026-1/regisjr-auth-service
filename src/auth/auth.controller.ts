import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { TokenResponse } from './dto/token.response';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthenticatedUser } from './types';

const REFRESH_COOKIE = 'refresh_token';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  // secure: true — enable in production (requires HTTPS)
  path: '/auth',
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiCreatedResponse({ type: TokenResponse })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponse> {
    const tokens = await this.authService.register(dto);
    this.setRefreshCookie(res, tokens.refresh_token);
    return tokens;
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: TokenResponse })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponse> {
    const tokens = await this.authService.login(dto);
    this.setRefreshCookie(res, tokens.refresh_token);
    return tokens;
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOkResponse({ type: TokenResponse })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponse> {
    const refreshToken =
      dto.refresh_token ?? (req.cookies as Record<string, string>)[REFRESH_COOKIE];
    const tokens = await this.authService.refresh({ refresh_token: refreshToken });
    this.setRefreshCookie(res, tokens.refresh_token);
    return tokens;
  }

  @Post('logout')
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiNoContentResponse({ description: 'Session revoked.' })
  async logout(
    @Body() dto: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const refreshToken =
      dto.refresh_token ?? (req.cookies as Record<string, string>)[REFRESH_COOKIE];
    await this.authService.logout({ refresh_token: refreshToken });
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('keycloak')
  @ApiOkResponse({ description: 'Authenticated Keycloak user claims.' })
  getMe(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  private setRefreshCookie(res: Response, token?: string): void {
    if (!token) return;
    res.cookie(REFRESH_COOKIE, token, cookieOptions);
  }
}
