import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../auth/decorator/user.decorator';
import { MyJwtGuard } from '../auth/guard';
import { SetupService } from './setup.service';
import { SetDefaultLevelDto } from './dto';

@ApiTags('Setup')
@ApiBearerAuth()
@UseGuards(MyJwtGuard)
@Controller('setup')
export class SetupController {
  constructor(private setupService: SetupService) {}

  @ApiOperation({
    summary: 'Lấy cấu hình level mặc định của người dùng đang đăng nhập',
  })
  @ApiResponse({ status: 200, description: 'Lấy cấu hình thành công.' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực (Unauthorized).' })
  @Get('default-level')
  getDefaultLevels(@GetUser('id') userId: number) {
    return this.setupService.getDefaultLevels(userId);
  }

  @ApiOperation({
    summary:
      'Cập nhật (thay thế toàn bộ) cấu hình level mặc định của người dùng đang đăng nhập',
  })
  @ApiResponse({ status: 200, description: 'Cập nhật cấu hình thành công.' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ.' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực (Unauthorized).' })
  @Put('default-level')
  setDefaultLevels(
    @GetUser('id') userId: number,
    @Body() dto: SetDefaultLevelDto,
  ) {
    return this.setupService.setDefaultLevels(userId, dto);
  }
}
