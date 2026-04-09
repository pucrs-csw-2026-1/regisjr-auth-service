import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '../user-status.enum';

export class UserProfileResponse {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  keycloakUserId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}
