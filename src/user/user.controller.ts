import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../auth/decorator/user.decorator';
import { MyJwtGuard } from '../auth/guard';
import type { User } from '../generated/prisma/client';
import { UserService } from './user.service';
import { PlanService } from 'src/plan/plan.service';
import { UpdateUserDto } from './dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(MyJwtGuard)
@Controller('users')
export class UserController {
  constructor(
    private userService: UserService,
    private planService: PlanService,
  ) {}

  @ApiOperation({ summary: 'Lấy thông tin người dùng đang đăng nhập' })
  @ApiResponse({ status: 200, description: 'Lấy thông tin thành công.' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực (Unauthorized).' })
  @Get('me')
  me(@GetUser() user: User) {
    return user;
  }

  @ApiOperation({
    summary:
      'Gói của người dùng đang đăng nhập: giới hạn (null = không giới hạn) và mức đang sử dụng',
  })
  @ApiResponse({ status: 200, description: 'Lấy thông tin thành công.' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực (Unauthorized).' })
  @Get('me/limits')
  getMyLimits(@GetUser('id') userId: number) {
    return this.planService.getMyLimits(userId);
  }

  @ApiOperation({
    summary: 'Cập nhật thông tin cá nhân của người dùng đang đăng nhập',
  })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công.' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực (Unauthorized).' })
  @Patch('me')
  updateProfile(@GetUser('id') userId: number, @Body() dto: UpdateUserDto) {
    return this.userService.updateProfile(userId, dto);
  }
}
