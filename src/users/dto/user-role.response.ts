import { ApiProperty } from '@nestjs/swagger';

export class UserRoleResponse {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  roleName!: string;

  @ApiProperty()
  assignedAt!: string;
}
