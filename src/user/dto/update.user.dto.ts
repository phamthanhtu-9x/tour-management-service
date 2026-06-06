import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'Tên hiển thị của người dùng',
    example: 'Nguyễn Văn A',
  })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional({
    description: 'URL ảnh đại diện của người dùng',
    example: 'https://example.com/avatar.png',
  })
  @IsString()
  @IsOptional()
  avatar?: string;

  @ApiPropertyOptional({
    description: 'Tên của người dùng',
    example: 'Văn A',
  })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Họ của người dùng',
    example: 'Nguyễn',
  })
  @IsString()
  @IsOptional()
  lastName?: string;
}
