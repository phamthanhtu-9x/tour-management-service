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
import { AdminUserQueryDto, UpdatePlanDto, UpdateUserRoleDto } from './dto';

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
    });
  }
}
