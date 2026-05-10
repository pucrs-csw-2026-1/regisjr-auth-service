import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TokenResponse {
  @ApiProperty()
  access_token!: string;

  @ApiProperty()
  expires_in!: number;

  @ApiProperty()
  token_type!: string;

  @ApiPropertyOptional({
    description:
      'Refresh token — also set as httpOnly cookie (refresh_token). ' +
      'Web clients should rely on the cookie; mobile clients can use this field.',
  })
  refresh_token?: string;
}
