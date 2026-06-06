import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdatePlayerDto {
  @ApiPropertyOptional({
    description: 'Tên của người chơi',
    example: 'Nguyễn Văn A',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Ảnh đại diện của người chơi (URL)',
    example: 'https://example.com/avatar.png',
  })
  @IsString()
  @IsOptional()
  avatar?: string;
}
