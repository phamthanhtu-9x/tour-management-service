import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { TourLevelItemDto } from './tour-level-item.dto';

export class UpdateTourDto {
  @ApiPropertyOptional({
    description: 'Tên của tour',
    example: 'Hyper turbo',
  })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    description: 'Mô tả của tour',
    example: 'Giải đấu hyper turbo cuối tuần',
  })
  @IsString()
  @IsOptional()
  desc?: string;

  @ApiPropertyOptional({
    description: 'Thời gian bắt đầu của tour (ISO 8601)',
    example: '2026-06-10T18:00:00.000Z',
  })
  @IsDateString()
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional({
    description:
      'Danh sách level của tour (nếu có, sẽ thay thế toàn bộ level hiện tại)',
    type: [TourLevelItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TourLevelItemDto)
  @IsOptional()
  levels?: TourLevelItemDto[];
}
