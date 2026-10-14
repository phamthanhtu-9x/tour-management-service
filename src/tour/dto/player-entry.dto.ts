import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class PlayerEntryDto {
  @ApiPropertyOptional({
    description:
      'Id (uuid) của entry do server sinh. Gửi lại khi cập nhật hàng loạt để giữ nguyên entry; bỏ trống với entry mới',
    example: '6f1c2a9e-1b2d-4c3e-8f4a-5b6c7d8e9f00',
  })
  @IsUUID()
  @IsOptional()
  id?: string;

  @ApiPropertyOptional({
    description:
      'Id của người chơi trong bảng players (phải thuộc về user hiện tại). Bỏ trống nếu là khách vãng lai',
    example: 5,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  playerId?: number;

  @ApiProperty({ description: 'Tên người chơi', example: 'Nguyễn Văn A' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Ảnh đại diện người chơi',
    example: 'https://example.com/avatar.png',
  })
  @IsString()
  @IsOptional()
  avatar?: string;

  @ApiPropertyOptional({
    description: 'Người chơi đã bị loại hay chưa',
    default: false,
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  isEliminated?: boolean;

  @ApiPropertyOptional({
    description: 'Số lần re-buy của người chơi',
    default: 0,
    example: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  reBuyCount?: number;

  @ApiPropertyOptional({
    description:
      'Số chip của từng lần add-on (mỗi phần tử là một lần add-on, số nguyên >= 1)',
    type: [Number],
    default: [],
    example: [10000, 10000],
  })
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  addOn?: number[];
}
