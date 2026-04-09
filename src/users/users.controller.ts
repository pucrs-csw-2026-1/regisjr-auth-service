import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { UserProfileResponse } from './dto/user-profile.response';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth('keycloak')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiCreatedResponse({ type: UserProfileResponse })
  createUser(
    @Body() dto: CreateUserProfileDto,
  ): Promise<UserProfileResponse> {
    return this.usersService.createProfile(dto);
  }

  @Get(':id')
  @ApiOkResponse({ type: UserProfileResponse })
  getUser(@Param('id') id: string): Promise<UserProfileResponse> {
    return this.usersService.getProfile(id);
  }
}
