import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MyJwtGuard } from '../auth/guard';
import { GetUser } from '../auth/decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(MyJwtGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @ApiOperation({
    summary: 'Thống kê tổng số tour đã tạo và tổng số player của người dùng',
  })
  @ApiResponse({ status: 200, description: 'Lấy thống kê thành công.' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực (Unauthorized).' })
  @Get('summary')
  getSummary(@GetUser('id') userId: number) {
    return this.dashboardService.getSummary(userId);
  }

  @ApiOperation({
    summary:
      'Danh sách tour đang chạy (gồm cả đang tạm dừng) của người dùng, kèm level/blind hiện tại, thời gian còn lại, số người chơi',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách thành công.' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực (Unauthorized).' })
  @Get('running-tours')
  getRunningTours(@GetUser('id') userId: number) {
    return this.dashboardService.getRunningTours(userId);
  }
}
