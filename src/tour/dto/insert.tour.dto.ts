import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
}
