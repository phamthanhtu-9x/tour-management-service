import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dtos/pagination-query.dto';

export class AdminUserQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Tìm theo email, slug hoặc tên hiển thị (không phân biệt hoa thường)',
    example: 'pham',
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

  @ApiPropertyOptional({
    description: 'Lọc theo role',
    enum: ['SUPER_ADMIN', 'TRIAL', 'STANDARD'],
  })
  @IsIn(['SUPER_ADMIN', 'TRIAL', 'STANDARD'])
  @IsOptional()
  role?: 'SUPER_ADMIN' | 'TRIAL' | 'STANDARD';
}
