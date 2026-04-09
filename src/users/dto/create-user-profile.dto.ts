import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { UserStatus } from '../user-status.enum';

export class CreateUserProfileDto {
  @ApiProperty({
    example: 'd9f34c53-3422-44de-9425-cc0ec3bf1f8f',
    description: 'Keycloak subject identifier.',
  })
  @IsString()
  @IsNotEmpty()
  keycloakUserId!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ enum: UserStatus, default: UserStatus.Active })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
