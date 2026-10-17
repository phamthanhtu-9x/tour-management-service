import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MyJwtGuard, RolesGuard } from '../auth/guard';
import { Roles } from '../auth/decorator';
import { PlanService } from 'src/plan/plan.service';
import type { Plan } from 'src/plan/plan.types';
import { AdminService } from './admin.service';
import {
  AdminUserQueryDto,
  UpdatePlanDto,
  UpdateSubscriptionDto,
  UpdateUserRoleDto,
} from './dto';

/** Chỉ SUPER_ADMIN được dùng các API trong controller này. */
@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(MyJwtGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private adminService: AdminService,
    private planService: PlanService,
  ) {}

  @ApiOperation({
    summary: 'Danh sách user (phân trang, tìm kiếm, lọc theo role)',
  })
  @ApiResponse({ status: 200, description: 'Lấy danh sách thành công.' })
  @ApiResponse({ status: 403, description: 'Không phải super admin.' })
  @Get('users')
  getUsers(@Query() query: AdminUserQueryDto) {
    return this.adminService.getUsers(query);
  }

  @ApiOperation({
    summary:
      'Đổi gói của user (TRIAL / STANDARD). Không áp dụng cho super admin',
  })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công.' })
  @ApiResponse({
    status: 403,
    description: 'Không phải super admin, hoặc user đích là super admin.',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy user.' })
  @Patch('users/:id/role')
  updateUserRole(
    @Param('id', ParseIntPipe) userId: number,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.adminService.updateUserRole(userId, dto.role);
  }

  @ApiOperation({
    summary:
      'Đổi gói và/hoặc thời hạn của user (role, expiresAt, extendDays – gửi trường nào đổi trường đó)',
  })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công.' })
  @ApiResponse({
    status: 400,
    description:
      'Không gửi trường nào, gửi cả expiresAt và extendDays, hoặc gia hạn tài khoản vô thời hạn.',
  })
  @ApiResponse({ status: 403, description: 'User đích là super admin.' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy user.' })
  @Patch('users/:id/subscription')
  updateSubscription(
    @Param('id', ParseIntPipe) userId: number,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.adminService.updateSubscription(userId, dto);
  }

  @ApiOperation({ summary: 'Xem giới hạn của các gói (TRIAL, STANDARD)' })
  @ApiResponse({ status: 200, description: 'Lấy cấu hình thành công.' })
  @Get('plans')
  getPlans() {
    return this.planService.getAllPlans();
  }

  @ApiOperation({ summary: 'Cập nhật toàn bộ giới hạn của một gói' })
  @ApiParam({ name: 'plan', enum: ['TRIAL', 'STANDARD'] })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công.' })
  @Put('plans/:plan')
  updatePlan(
    @Param('plan', new ParseEnumPipe({ TRIAL: 'TRIAL', STANDARD: 'STANDARD' }))
    plan: Plan,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.planService.updatePlan(plan, {
      maxPlayers: dto.maxPlayers,
      maxTours: dto.maxTours,
      maxRunningTours: dto.maxRunningTours,
      canExportPlayers: dto.canExportPlayers,
      durationDays: dto.durationDays,
      downgradeDays: dto.downgradeDays,
    });
  }
}
