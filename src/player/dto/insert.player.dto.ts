import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class InsertPlayerDto {
  @ApiPropertyOptional({
    description: 'Tên của người chơi',
    example: 'Nguyễn Văn A',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Ảnh đại diện của người chơi (URL)',
    example: 'https://example.com/avatar.png',
  })
  @IsString()
  @IsOptional()
  avatar?: string;
}
