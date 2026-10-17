import { Injectable, UnauthorizedException } from '@nestjs/common';
import { accountExpiredError, isAccountExpired } from '../../plan/expiry.util';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanService } from '../../plan/plan.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    public prismaService: PrismaService,
    private planService: PlanService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: { sub: number; email: string }) {
    const found = await this.prismaService.user.findUnique({
      where: { id: payload.sub },
    });
    if (!found) {
      throw new UnauthorizedException();
    }
    // STANDARD hết hạn → tự hạ TRIAL (thêm downgradeDays) trước khi xét khoá
    const user = await this.planService.resolveAccount(found);
    // Hết hạn → chặn mọi API cần đăng nhập ngay, kể cả token còn hiệu lực
    if (user.planExpiresAt && isAccountExpired(user.role, user.planExpiresAt)) {
      throw accountExpiredError(user.planExpiresAt);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { hashedPassword, ...safeUser } = user; // Remove sensitive information
    return safeUser;
  }
}
