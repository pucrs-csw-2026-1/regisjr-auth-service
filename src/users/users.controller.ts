import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
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

  @Patch(':id')
  @ApiOkResponse({ type: UserProfileResponse })
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserProfileDto,
  ): Promise<UserProfileResponse> {
    return this.usersService.updateProfile(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'User profile deleted.' })
  deleteUser(@Param('id') id: string): Promise<void> {
    return this.usersService.deleteProfile(id);
  }
}
