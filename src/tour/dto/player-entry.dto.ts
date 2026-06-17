import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class PlayerEntryDto {
  @ApiProperty({ description: 'Tên người chơi', example: 'Nguyễn Văn A' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Ảnh đại diện người chơi',
    example: 'https://example.com/avatar.png',
  })
  @IsString()
  @IsOptional()
  avatar?: string;

  @ApiPropertyOptional({
    description: 'Người chơi đã bị loại hay chưa',
    default: false,
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  isEliminated?: boolean;

  @ApiPropertyOptional({
    description: 'Số lần re-buy của người chơi',
    default: 0,
    example: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  reBuyCount?: number;
}
