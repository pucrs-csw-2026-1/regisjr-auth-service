import { Injectable, NotFoundException } from '@nestjs/common';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { UserProfileResponse } from './dto/user-profile.response';
import { UserRoleResponse } from './dto/user-role.response';
import { UserProfile, UserRole } from './entities';
import { UsersRoleRepository } from './users-role.repository';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly usersRoleRepository: UsersRoleRepository,
  ) {}

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

  async assignRole(userId: string, dto: AssignRoleDto): Promise<UserRoleResponse> {
    await this.getProfile(userId);
    const role = await this.usersRoleRepository.assignRole(userId, dto.roleName);
    return this.toRoleResponse(role);
  }

  async listRoles(userId: string): Promise<UserRoleResponse[]> {
    await this.getProfile(userId);
    const roles = await this.usersRoleRepository.listRoles(userId);
    return roles.map((r) => this.toRoleResponse(r));
  }

  async removeRole(userId: string, roleName: string): Promise<void> {
    await this.getProfile(userId);
    await this.usersRoleRepository.removeRole(userId, roleName);
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

  private toRoleResponse(role: UserRole): UserRoleResponse {
    return {
      userId: role.userId,
      roleName: role.roleName,
      assignedAt: role.assignedAt,
    };
  }
}
