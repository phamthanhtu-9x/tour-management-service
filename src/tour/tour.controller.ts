import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseArrayPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MyJwtGuard } from '../auth/guard';
import { TourService } from './tour.service';
import { GetUser } from '../auth/decorator';
import { InsertTourDto } from './dto';
import { UpdateTourDto } from './dto/update.tour.dto';
import { SetLevelDto, PlayerEntryDto, UpdateGtdDto } from './dto';
import { PaginationQueryDto } from 'src/common/dtos/pagination-query.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Tours')
@ApiBearerAuth()
@UseGuards(MyJwtGuard)
@Controller('tours')
export class TourController {
  constructor(private tourService: TourService) {}
  @ApiOperation({
    summary: 'Lấy danh sách các Tour của người dùng (Có phân trang)',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách thành công.' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực (Unauthorized).' })
  @Get()
  getTours(@GetUser('id') userId: number, @Query() query: PaginationQueryDto) {
    return this.tourService.getTours(userId, query);
  }

  @Get(':id')
  getTourById(@Param('id', ParseIntPipe) tourId: number) {
    return this.tourService.getTourById(tourId);
  }

  @ApiOperation({ summary: 'Lấy danh sách level của một tour' })
  @ApiResponse({ status: 200, description: 'Lấy danh sách level thành công.' })
  @ApiResponse({ status: 403, description: 'Không có quyền xem tour này.' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy tour.' })
  @Get(':id/levels')
  getTourLevels(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) tourId: number,
  ) {
    return this.tourService.getTourLevels(userId, tourId);
  }

  @ApiOperation({ summary: 'Lấy thông tin điều khiển clock của một tour' })
  @ApiResponse({
    status: 200,
    description: 'Lấy thông tin control thành công.',
  })
  @ApiResponse({ status: 403, description: 'Không có quyền xem tour này.' })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy tour hoặc control.',
  })
  @Get(':id/control')
  getTourControl(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) tourId: number,
  ) {
    return this.tourService.getTourControl(userId, tourId);
  }

  @Post()
  insertTour(
    @GetUser('id') userId: number,
    @Body() insertTourDto: InsertTourDto,
  ) {
    return this.tourService.insertTour(userId, insertTourDto);
  }

  @Patch(':id')
  updateTour(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) tourId: number,
    @Body() updateTourDto: UpdateTourDto,
  ) {
    return this.tourService.updateTour(userId, tourId, updateTourDto);
  }

  @Delete(':id/delete')
  deleteTour(@Param('id', ParseIntPipe) tourId: number) {
    return this.tourService.deleteTour(tourId);
  }

  // --- ĐIỀU KHIỂN CLOCK ---

  @ApiOperation({ summary: 'Bắt đầu chạy clock của tour' })
  @ApiResponse({ status: 200, description: 'Bắt đầu thành công.' })
  @Patch(':id/control/start')
  startClock(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) tourId: number,
  ) {
    return this.tourService.startClock(userId, tourId);
  }

  @ApiOperation({ summary: 'Tạm dừng clock của tour' })
  @ApiResponse({ status: 200, description: 'Tạm dừng thành công.' })
  @Patch(':id/control/pause')
  pauseClock(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) tourId: number,
  ) {
    return this.tourService.pauseClock(userId, tourId);
  }

  @ApiOperation({ summary: 'Tiếp tục clock từ chỗ đã tạm dừng' })
  @ApiResponse({ status: 200, description: 'Tiếp tục thành công.' })
  @Patch(':id/control/resume')
  resumeClock(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) tourId: number,
  ) {
    return this.tourService.resumeClock(userId, tourId);
  }

  @ApiOperation({ summary: 'Chuyển sang level kế tiếp' })
  @ApiResponse({ status: 200, description: 'Chuyển level thành công.' })
  @Patch(':id/control/next')
  nextLevel(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) tourId: number,
  ) {
    return this.tourService.nextLevel(userId, tourId);
  }

  @ApiOperation({ summary: 'Quay về level trước đó' })
  @ApiResponse({ status: 200, description: 'Chuyển level thành công.' })
  @Patch(':id/control/prev')
  prevLevel(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) tourId: number,
  ) {
    return this.tourService.prevLevel(userId, tourId);
  }

  @ApiOperation({ summary: 'Nhảy tới một level cụ thể' })
  @ApiResponse({ status: 200, description: 'Chuyển level thành công.' })
  @Patch(':id/control/set-level')
  setLevel(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) tourId: number,
    @Body() dto: SetLevelDto,
  ) {
    return this.tourService.setLevel(userId, tourId, dto);
  }

  @ApiOperation({ summary: 'Reset clock về trạng thái ban đầu' })
  @ApiResponse({ status: 200, description: 'Reset thành công.' })
  @Patch(':id/control/reset')
  resetClock(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) tourId: number,
  ) {
    return this.tourService.resetClock(userId, tourId);
  }

  @ApiOperation({ summary: 'Tua tới 5 giây trong level hiện tại' })
  @ApiResponse({ status: 200, description: 'Tua tới thành công.' })
  @Patch(':id/control/forward')
  forwardTime(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) tourId: number,
  ) {
    return this.tourService.forwardTime(userId, tourId);
  }

  @ApiOperation({ summary: 'Tua lùi 5 giây trong level hiện tại' })
  @ApiResponse({ status: 200, description: 'Tua lùi thành công.' })
  @Patch(':id/control/rewind')
  rewindTime(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) tourId: number,
  ) {
    return this.tourService.rewindTime(userId, tourId);
  }

  @ApiOperation({
    summary: 'Cập nhật danh sách entries (người chơi) của control',
  })
  @ApiResponse({ status: 200, description: 'Cập nhật entries thành công.' })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền điều khiển tour này.',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy tour hoặc control.',
  })
  @Patch(':id/control/entries')
  updateEntries(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) tourId: number,
    @Body(new ParseArrayPipe({ items: PlayerEntryDto }))
    entries: PlayerEntryDto[],
  ) {
    return this.tourService.updateEntries(userId, tourId, entries);
  }

  @ApiOperation({ summary: 'Cập nhật chuỗi GTD (giải thưởng) của control' })
  @ApiResponse({ status: 200, description: 'Cập nhật GTD thành công.' })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền điều khiển tour này.',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy tour hoặc control.',
  })
  @Patch(':id/control/gtd')
  updateGtd(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) tourId: number,
    @Body() dto: UpdateGtdDto,
  ) {
    return this.tourService.updateGtd(userId, tourId, dto);
  }
}
