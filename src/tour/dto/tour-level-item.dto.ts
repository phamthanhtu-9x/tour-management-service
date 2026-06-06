import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { LevelType } from '../../generated/prisma/enums';

export class TourLevelItemDto {
  @ApiPropertyOptional({
    description: 'Tên hiển thị của level',
    example: 'Level 1',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Loại level: BLIND hoặc BREAK',
    enum: LevelType,
    example: LevelType.BLIND,
  })
  @IsEnum(LevelType)
  @IsNotEmpty()
  type: LevelType;

  @ApiProperty({
    description: 'Thứ tự của level trong tour (bắt đầu từ 1)',
    example: 1,
  })
  @IsInt()
  @Min(1)
  idx: number;

  @ApiProperty({
    description: 'Thời lượng của level (phút)',
    example: 20,
  })
  @IsInt()
  @Min(1)
  duration: number;

  @ApiPropertyOptional({
    description: 'Small blind (chỉ dùng khi type = BLIND)',
    example: 100,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  smallBlind?: number;

  @ApiPropertyOptional({
    description: 'Big blind (chỉ dùng khi type = BLIND)',
    example: 100,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  bigBlind?: number;

  @ApiPropertyOptional({
    description: 'Ante (chỉ dùng khi type = BLIND)',
    example: 100,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  ante?: number;
}
