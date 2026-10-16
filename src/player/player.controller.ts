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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MyJwtGuard } from '../auth/guard';
import { GetUser } from '../auth/decorator';
import { PlayerService } from './player.service';
import { InsertPlayerDto, SearchPlayerQueryDto, UpdatePlayerDto } from './dto';

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
