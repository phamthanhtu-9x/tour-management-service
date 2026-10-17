import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { MyJwtGuard } from '../auth/guard';
import { GetUser } from '../auth/decorator';
import { PlayerService } from './player.service';
import {
  ExportPlayerQueryDto,
  InsertPlayerDto,
  SearchPlayerQueryDto,
  UpdatePlayerDto,
} from './dto';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Ngày hiện tại theo giờ Việt Nam, dạng YYYY-MM-DD (dùng cho tên file). */
const todayVN = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
    new Date(),
  );

@ApiTags('Players')
@ApiBearerAuth()
@UseGuards(MyJwtGuard)
@Controller('players')
export class PlayerController {
  constructor(private playerService: PlayerService) {}

  @ApiOperation({
    summary:
      'Lấy danh sách người chơi của người dùng (Có phân trang, tìm theo tên hoặc số điện thoại qua `search`)',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách thành công.' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực (Unauthorized).' })
  @Get()
  getPlayers(
    @GetUser('id') userId: number,
    @Query() query: SearchPlayerQueryDto,
  ) {
    return this.playerService.getPlayers(userId, query);
  }

  // LƯU Ý: phải khai báo TRƯỚC route ':id' để 'export' không bị hiểu là id
  @ApiOperation({
    summary:
      'Xuất file Excel danh sách người chơi (Tên, Số điện thoại, Điểm) – lọc theo `search` nếu có',
  })
  @ApiProduces(XLSX_MIME)
  @ApiResponse({
    status: 200,
    description: 'File .xlsx',
    content: { [XLSX_MIME]: { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực (Unauthorized).' })
  @Get('export')
  async exportPlayers(
    @GetUser('id') userId: number,
    @Query() query: ExportPlayerQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.playerService.exportPlayers(userId, query.search);
    const filename = `danh-sach-player-${todayVN()}.xlsx`;
    res.set({
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
      // Cho phép frontend (khác origin) đọc tên file từ header
      'Access-Control-Expose-Headers': 'Content-Disposition',
    });
    res.send(buffer);
  }

  @ApiOperation({ summary: 'Lấy thông tin một người chơi' })
  @ApiResponse({ status: 200, description: 'Lấy thông tin thành công.' })
  @ApiResponse({ status: 403, description: 'Không có quyền truy cập.' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy người chơi.' })
  @Get(':id')
  getPlayerById(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) playerId: number,
  ) {
    return this.playerService.getPlayerById(userId, playerId);
  }

  @ApiOperation({ summary: 'Tạo mới một người chơi' })
  @ApiResponse({ status: 201, description: 'Tạo thành công.' })
  @Post()
  insertPlayer(@GetUser('id') userId: number, @Body() dto: InsertPlayerDto) {
    return this.playerService.insertPlayer(userId, dto);
  }

  @ApiOperation({ summary: 'Cập nhật thông tin người chơi' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công.' })
  @ApiResponse({ status: 403, description: 'Không có quyền truy cập.' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy người chơi.' })
  @Patch(':id')
  updatePlayer(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) playerId: number,
    @Body() dto: UpdatePlayerDto,
  ) {
    return this.playerService.updatePlayer(userId, playerId, dto);
  }

  @ApiOperation({ summary: 'Xóa một người chơi' })
  @ApiResponse({ status: 200, description: 'Xóa thành công.' })
  @ApiResponse({ status: 403, description: 'Không có quyền truy cập.' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy người chơi.' })
  @Delete(':id/delete')
  deletePlayer(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) playerId: number,
  ) {
    return this.playerService.deletePlayer(userId, playerId);
  }
}
