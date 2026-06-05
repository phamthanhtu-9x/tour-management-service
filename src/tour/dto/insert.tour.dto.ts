import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class InsertTourDto {
  @ApiPropertyOptional({
    description: 'Tên của tour',
    default: 'Hyper turbo',
    example: 'Hyper turbo',
  })
  @IsString()
  @IsNotEmpty()
  title: string;
}
