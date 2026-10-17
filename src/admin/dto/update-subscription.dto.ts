import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * Đổi gói và/hoặc thời hạn của user. Mọi trường tuỳ chọn và độc lập:
 * gửi trường nào thì đổi trường đó. `expiresAt` và `extendDays` không dùng cùng lúc.
 */
export class UpdateSubscriptionDto {
  @ApiPropertyOptional({
    description:
      'Gói mới (không đổi thời hạn trừ khi gửi kèm expiresAt/extendDays)',
    enum: ['TRIAL', 'STANDARD'],
  })
  @IsIn(['TRIAL', 'STANDARD'], {
    message: 'role chỉ được là TRIAL hoặc STANDARD',
  })
  @IsOptional()
  role?: 'TRIAL' | 'STANDARD';

  @ApiPropertyOptional({
    description:
      'Ngày hết hạn YYYY-MM-DD (hết hạn lúc 23:59:59 giờ Việt Nam của ngày đó). null = vô thời hạn',
    type: String,
    nullable: true,
    example: '2026-12-31',
  })
  @ValidateIf((o: UpdateSubscriptionDto) => o.expiresAt != null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'expiresAt phải có dạng YYYY-MM-DD',
  })
  @IsISO8601({ strict: true }, { message: 'expiresAt không phải ngày hợp lệ' })
  expiresAt?: string | null;

  @ApiPropertyOptional({
    description:
      'Gia hạn thêm N ngày (cộng dồn: còn hạn thì cộng từ hạn cũ, hết hạn thì cộng từ hôm nay)',
    minimum: 1,
    maximum: 3650,
    example: 30,
  })
  @IsInt()
  @Min(1)
  @Max(3650)
  @IsOptional()
  extendDays?: number;
}
