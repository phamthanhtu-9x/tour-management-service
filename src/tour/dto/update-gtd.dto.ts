import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateGtdDto {
  @ApiProperty({
    description: 'Chuỗi GTD (giải thưởng) dạng "10/5/3/3/1/.."',
    example: '10/5/3/3/1',
  })
  @IsString()
  @IsNotEmpty()
  gtd: string;
}
