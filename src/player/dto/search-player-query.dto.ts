import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dtos/pagination-query.dto';

export class SearchPlayerQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Từ khoá tìm theo tên (không dấu, không phân biệt hoa thường) hoặc số điện thoại (một phần số, +84 và 0 coi là một)',
    example: 'nguyen van',
    maxLength: 100,
  })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;
}
