import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  @ApiPropertyOptional({
    description: 'Refresh token. If omitted, read from the refresh_token cookie.',
  })
  @IsString()
  @IsOptional()
  refresh_token?: string;
}
