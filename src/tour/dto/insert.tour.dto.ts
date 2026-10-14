import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class InsertTourDto {
  @ApiProperty({
    description: 'Tên của tour',
    example: 'Hyper turbo',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

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
      'Idx của level mà thời gian đăng ký (re-entry) kết thúc. Bỏ trống = không giới hạn',
    example: 6,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  regEnd?: number;
}
