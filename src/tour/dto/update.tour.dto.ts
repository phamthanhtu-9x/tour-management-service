import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateTourDto {
  @ApiPropertyOptional({
    description: 'Tên của tour',
    default: 'Hyper turbo',
    example: 'Hyper turbo',
  })
  @IsString()
  @IsOptional()
  title?: string;
}
