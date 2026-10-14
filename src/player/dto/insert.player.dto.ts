import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

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

  @ApiPropertyOptional({
    description: 'Điểm của người chơi (số thực, không âm)',
    default: 0,
    example: 12.5,
    minimum: 0,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @IsOptional()
  point?: number;
}
