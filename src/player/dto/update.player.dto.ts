import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

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

  @ApiPropertyOptional({
    description: 'Điểm của người chơi (số thực, không âm)',
    example: 12.5,
    minimum: 0,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @IsOptional()
  point?: number;
}
