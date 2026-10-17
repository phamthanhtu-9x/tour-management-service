import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
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

  @ApiPropertyOptional({
    description:
      'Lọc theo trạng thái thời hạn: active (còn dùng được) / expired (đã hết hạn)',
    enum: ['active', 'expired'],
  })
  @IsIn(['active', 'expired'])
  @IsOptional()
  status?: 'active' | 'expired';

  @ApiPropertyOptional({
    description: 'Chỉ lấy user còn hạn và sẽ hết hạn trong N ngày tới',
    minimum: 1,
    maximum: 365,
    example: 7,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  @IsOptional()
  expiringInDays?: number;
}
