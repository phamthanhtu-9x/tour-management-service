import { SetMetadata } from '@nestjs/common';
import type { Role } from 'src/plan/plan.types';

export const ROLES_KEY = 'roles';

/** Chỉ cho phép các role được liệt kê (dùng kèm MyJwtGuard + RolesGuard). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
