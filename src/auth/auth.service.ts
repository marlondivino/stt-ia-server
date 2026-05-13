import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

interface JwtPayload {
  sub: string;
  username: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly adminUsername: string;
  private readonly adminPassword: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.adminUsername = this.configService.get<string>('ADMIN_USERNAME', 'admin');
    this.adminPassword = this.configService.get<string>('ADMIN_PASSWORD', 'admin');
  }

  async login(username: string, password: string): Promise<{ access_token: string }> {
    // Simple credential validation (replace with DB lookup in production)
    if (username !== this.adminUsername || password !== this.adminPassword) {
      this.logger.warn(`Failed login attempt for user: ${username}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: '1',
      username,
    };

    const access_token = this.jwtService.sign(payload);

    this.logger.log(`User "${username}" authenticated successfully`);

    return { access_token };
  }

  async validateUser(payload: JwtPayload): Promise<JwtPayload> {
    // In production, verify the user still exists in the database
    return payload;
  }
}
