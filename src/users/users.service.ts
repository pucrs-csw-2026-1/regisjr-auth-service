import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { UserProfileResponse } from './dto/user-profile.response';
import { UserProfile } from './entities';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async createProfile(dto: CreateUserProfileDto): Promise<UserProfileResponse> {
    const profile = await this.usersRepository.createProfile(dto);
    return this.toResponse(profile);
  }

  async getProfile(userId: string): Promise<UserProfileResponse> {
    const profile = await this.usersRepository.getProfile(userId);

    if (!profile) {
      throw new NotFoundException('User profile not found');
    }

    return this.toResponse(profile);
  }

  async getByKeycloakUserId(
    keycloakUserId: string,
  ): Promise<UserProfileResponse> {
    const profile = await this.usersRepository.getByKeycloakUserId(
      keycloakUserId,
    );

    if (!profile) {
      throw new NotFoundException('User profile not found');
    }

    return this.toResponse(profile);
  }

  async updateProfile(
    userId: string,
    dto: UpdateUserProfileDto,
  ): Promise<UserProfileResponse> {
    const profile = await this.usersRepository.updateProfile(userId, dto);

    if (!profile) {
      throw new NotFoundException('User profile not found');
    }

    return this.toResponse(profile);
  }

  async deleteProfile(userId: string): Promise<void> {
    await this.getProfile(userId);
    await this.usersRepository.deleteProfile(userId);
  }

  private toResponse(profile: UserProfile): UserProfileResponse {
    return {
      userId: profile.userId,
      keycloakUserId: profile.keycloakUserId,
      name: profile.name,
      email: profile.email,
      status: profile.status,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
