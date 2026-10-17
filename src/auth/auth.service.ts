import { AuthDTO } from './dto/auth.dto';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as argon from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { slugBaseFromEmail, slugCandidate } from '../user/slug.util';
import { PlanService } from '../plan/plan.service';
import {
  accountExpiredError,
  defaultExpiry,
  isAccountExpired,
} from '../plan/expiry.util';

/** Số lần thử lại khi slug vừa sinh bị người khác lấy mất (đăng ký đồng thời). */
const SLUG_RETRY = 3;

@Injectable()
export class AuthService {
  constructor(
    private prismaService: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private planService: PlanService,
  ) {}
  async register(authDTO: AuthDTO) {
    const hashedPassword = await argon.hash(authDTO.password);
    // User mới = TRIAL, nhận thời hạn mặc định của gói TRIAL
    const { durationDays } = await this.planService.getLimitsForRole('TRIAL');
    const planExpiresAt = defaultExpiry(durationDays);

    for (let attempt = 1; ; attempt++) {
      const slug = await this.generateUniqueSlug(authDTO.email);
      try {
        const user = await this.prismaService.user.create({
          data: {
            email: authDTO.email,
            hashedPassword: hashedPassword,
            firstName: '',
            lastName: '',
            slug,
            role: 'TRIAL',
            planExpiresAt,
          },
          select: {
            id: true,
            email: true,
            createdAt: true,
          },
        });
        return this.signJwtToken(user.id, user.email);
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'P2002'
        ) {
          const emailTaken = await this.prismaService.user.findUnique({
            where: { email: authDTO.email },
            select: { id: true },
          });
          if (emailTaken) {
            throw new ForbiddenException('Email already exists');
          }
          // Slug vừa bị người đăng ký đồng thời lấy mất → sinh lại
          if (attempt < SLUG_RETRY) continue;
        }
        throw error;
      }
    }
  }

  /** Sinh slug chưa ai dùng từ email: base, base-2, base-3, ... */
  private async generateUniqueSlug(email: string): Promise<string> {
    const base = slugBaseFromEmail(email);
    const taken = await this.prismaService.user.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });
    const used = new Set(taken.map((u) => u.slug));
    for (let n = 1; ; n++) {
      const candidate = slugCandidate(base, n);
      if (!used.has(candidate)) return candidate;
    }
  }

  async login(authDTO: AuthDTO) {
    const user = await this.prismaService.user.findUnique({
      where: {
        email: authDTO.email,
      },
    });
    if (!user) {
      throw new ForbiddenException('User not found');
    }
    const passwordMatches = await argon.verify(
      user.hashedPassword,
      authDTO.password,
    );
    if (!passwordMatches) {
      throw new ForbiddenException('Incorrect password');
    }
    // Kiểm tra hạn SAU khi đúng mật khẩu (không lộ trạng thái tài khoản cho người đoán mật khẩu).
    // STANDARD hết hạn → tự hạ TRIAL (còn hạn thêm downgradeDays) trước khi xét khoá.
    const account = await this.planService.resolveAccount(user);
    if (
      account.planExpiresAt &&
      isAccountExpired(account.role, account.planExpiresAt)
    ) {
      throw accountExpiredError(account.planExpiresAt);
    }

    return this.signJwtToken(user.id, user.email);
  }

  async signJwtToken(
    userId: number,
    email: string,
  ): Promise<{ access_token: string }> {
    const payload = { sub: userId, email };
    const secret = this.configService.get<string>('JWT_SECRET');
    const jwtString = await this.jwtService.signAsync(payload, {
      expiresIn: '24h',
      secret,
    });
    return {
      access_token: jwtString,
    };
  }
}
