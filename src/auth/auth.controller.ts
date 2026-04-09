import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthenticatedUser } from './types';

@ApiTags('auth')
@ApiBearerAuth('keycloak')
@Controller()
export class AuthController {
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: 'Authenticated Keycloak user claims.' })
  getMe(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
