import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateUserRoleDto {
  @ApiProperty({
    description: 'Gói mới của user (không thể gán SUPER_ADMIN)',
    enum: ['TRIAL', 'STANDARD'],
    example: 'STANDARD',
  })
  @IsIn(['TRIAL', 'STANDARD'], {
    message: 'role chỉ được là TRIAL hoặc STANDARD',
  })
  role: 'TRIAL' | 'STANDARD';
}
