import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PublicService } from './public.service';
import { PublicPlayerSearchDto } from './dto';

/**
 * API công khai – KHÔNG cần đăng nhập.
 * Giới hạn tần suất theo IP (ThrottlerGuard, cấu hình ở PublicModule).
 */
@ApiTags('Public')
@UseGuards(ThrottlerGuard)
@Controller('public')
export class PublicController {
  constructor(private publicService: PublicService) {}

  @ApiOperation({
    summary:
      'Tra cứu người chơi của một user theo tên hoặc số điện thoại (không cần đăng nhập)',
    description:
      'Tên: chứa từ khoá, không dấu, không phân biệt hoa thường (≥ 2 ký tự). Số điện thoại: phải khớp đủ số. Trả tối đa 20 kết quả; số điện thoại được che (0912***678). Giới hạn 30 lần/phút mỗi IP.',
  })
  @ApiParam({ name: 'slug', description: 'Slug của user', example: 'pham-tu' })
  @ApiResponse({ status: 200, description: 'Tra cứu thành công.' })
  @ApiResponse({ status: 400, description: 'Thiếu hoặc sai từ khoá tìm kiếm.' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy user theo slug.' })
  @ApiResponse({ status: 429, description: 'Gọi quá nhiều lần, thử lại sau.' })
  @Get('users/:slug/players')
  searchPlayers(
    @Param('slug') slug: string,
    @Query() query: PublicPlayerSearchDto,
  ) {
    return this.publicService.searchPlayers(slug, query.search);
  }
}
