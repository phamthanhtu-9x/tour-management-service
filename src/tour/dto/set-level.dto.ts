import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, Min } from 'class-validator';

export class SetLevelDto {
  @ApiProperty({
    description: 'Số thứ tự (idx) của level muốn nhảy tới',
    example: 3,
  })
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  level: number;
}
