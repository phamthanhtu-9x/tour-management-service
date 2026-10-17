import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, Min, ValidateIf } from 'class-validator';

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
}
