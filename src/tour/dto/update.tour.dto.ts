import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
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
    description: 'Số chip khởi điểm của mỗi người chơi',
    example: 20000,
  })
  @IsInt()
  @IsOptional()
  startingStack?: number;

  @ApiPropertyOptional({
    description:
      'Idx của level mà thời gian đăng ký (re-entry) kết thúc. Gửi null để bỏ giới hạn',
    example: 6,
    nullable: true,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  regEnd?: number | null;

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
