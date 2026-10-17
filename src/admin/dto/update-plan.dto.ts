import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, Max, Min, ValidateIf } from 'class-validator';

/** Cập nhật TOÀN BỘ giới hạn của một gói. Số = null nghĩa là không giới hạn. */
export class UpdatePlanDto {
  @ApiProperty({
    description: 'Số player tối đa (null = không giới hạn)',
    type: Number,
    nullable: true,
    example: 20,
  })
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  maxPlayers: number | null;

  @ApiProperty({
    description: 'Số tour tối đa được tạo (null = không giới hạn)',
    type: Number,
    nullable: true,
    example: 3,
  })
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  maxTours: number | null;

  @ApiProperty({
    description: 'Số tour chạy cùng lúc tối đa (null = không giới hạn)',
    type: Number,
    nullable: true,
    example: 1,
  })
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  maxRunningTours: number | null;

  @ApiProperty({
    description: 'Được xuất Excel danh sách player',
    example: false,
  })
  @IsBoolean()
  canExportPlayers: boolean;

  @ApiProperty({
    description:
      'Thời hạn mặc định (ngày) gán cho user MỚI đăng ký gói này (null = vô thời hạn). Không ảnh hưởng user đã có',
    type: Number,
    nullable: true,
    example: 14,
  })
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  durationDays: number | null;

  @ApiPropertyOptional({
    description:
      'Chỉ dùng cho STANDARD: hết hạn → tự hạ xuống TRIAL thêm N ngày (tính từ lúc hết hạn). null = khoá ngay. Bỏ trống = giữ nguyên',
    type: Number,
    nullable: true,
    example: 5,
  })
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(1)
  @Max(365)
  downgradeDays?: number | null;
}
