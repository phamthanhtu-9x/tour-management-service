import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class PublicPlayerSearchDto {
  @ApiProperty({
    description:
      'Từ khoá bắt buộc: tên người chơi (≥ 2 ký tự, không dấu, không phân biệt hoa thường) hoặc số điện thoại ĐẦY ĐỦ (+84 và 0 coi là một)',
    example: '0912345678',
    minLength: 2,
    maxLength: 100,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Cần nhập từ khoá tìm kiếm' })
  @IsNotEmpty({ message: 'Cần nhập từ khoá tìm kiếm' })
  @MinLength(2, { message: 'Từ khoá tìm kiếm cần ít nhất 2 ký tự' })
  @MaxLength(100)
  search: string;
}
