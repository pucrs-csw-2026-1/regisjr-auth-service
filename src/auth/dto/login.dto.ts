import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ example: 'secret123' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
