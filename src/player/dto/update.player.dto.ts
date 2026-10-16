import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';
import { normalizePhone, PHONE_REGEX } from './phone.util';

export class UpdatePlayerDto {
  @ApiPropertyOptional({
    description: 'Tên của người chơi',
    example: 'Nguyễn Văn A',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Ảnh đại diện của người chơi (URL)',
    example: 'https://example.com/avatar.png',
  })
  @IsString()
  @IsOptional()
  avatar?: string;

  @ApiPropertyOptional({
    description: 'Điểm của người chơi (số thực, không âm)',
    example: 12.5,
    minimum: 0,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @IsOptional()
  point?: number;

  @ApiPropertyOptional({
    description:
      "Số điện thoại: 8–15 chữ số, có thể có '+' ở đầu. Khoảng trắng, '.', '-', '(', ')' được tự bỏ. Không được trùng với player khác của bạn. Gửi null hoặc \"\" để bỏ trống",
    example: '0912345678',
    nullable: true,
  })
  @Transform(normalizePhone)
  @IsString()
  @Matches(PHONE_REGEX, {
    message: "Số điện thoại không hợp lệ (8–15 chữ số, có thể có '+' ở đầu)",
  })
  @IsOptional()
  phone?: string | null;
}
