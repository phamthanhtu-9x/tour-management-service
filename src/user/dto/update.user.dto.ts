import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotIn, IsOptional, IsString, Matches } from 'class-validator';
import { RESERVED_SLUGS, SLUG_FORMAT_MESSAGE, SLUG_REGEX } from '../slug.util';

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'Tên hiển thị của người dùng',
    example: 'Nguyễn Văn A',
  })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional({
    description: 'URL ảnh đại diện của người dùng',
    example: 'https://example.com/avatar.png',
  })
  @IsString()
  @IsOptional()
  avatar?: string;

  @ApiPropertyOptional({
    description: 'Tên của người dùng',
    example: 'Văn A',
  })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Họ của người dùng',
    example: 'Nguyễn',
  })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional({
    description:
      "Slug (định danh dạng URL) – duy nhất toàn hệ thống. Chỉ a-z, 0-9, '-', dài 3–30, không bắt đầu/kết thúc bằng '-'. Chữ hoa được tự chuyển thành chữ thường",
    example: 'pham-tu',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(SLUG_REGEX, { message: SLUG_FORMAT_MESSAGE })
  @IsNotIn(RESERVED_SLUGS, {
    message: 'Slug này là từ dành riêng, hãy chọn slug khác',
  })
  @IsOptional()
  slug?: string;
}
