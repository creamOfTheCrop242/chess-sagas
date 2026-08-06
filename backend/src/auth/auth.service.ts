import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

interface GoogleTokenResponse {
  access_token?: string;
}

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  createAuthorizationRequest(): { state: string; url: string } {
    const clientId = this.requiredConfig('GOOGLE_CLIENT_ID');
    const callbackUrl = this.requiredConfig('GOOGLE_CALLBACK_URL');
    const state = randomBytes(32).toString('base64url');
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });

    return {
      state,
      url: `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`,
    };
  }

  async completeGoogleLogin(
    code: string | undefined,
    returnedState: string | undefined,
    expectedState: string | undefined,
  ): Promise<{ sessionToken: string; user: AuthenticatedUser }> {
    if (!code || !this.statesMatch(returnedState, expectedState)) {
      throw new UnauthorizedException('Invalid Google authentication response');
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.requiredConfig('GOOGLE_CLIENT_ID'),
        client_secret: this.requiredConfig('GOOGLE_CLIENT_SECRET'),
        redirect_uri: this.requiredConfig('GOOGLE_CALLBACK_URL'),
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResponse.ok) {
      throw new BadGatewayException('Google token exchange failed');
    }
    const tokens = (await tokenResponse.json()) as GoogleTokenResponse;
    if (!tokens.access_token) {
      throw new BadGatewayException('Google did not return an access token');
    }

    const profileResponse = await fetch(
      'https://openidconnect.googleapis.com/v1/userinfo',
      { headers: { authorization: `Bearer ${tokens.access_token}` } },
    );
    if (!profileResponse.ok) {
      throw new BadGatewayException('Google profile lookup failed');
    }
    const profile = (await profileResponse.json()) as GoogleUserInfo;
    if (!profile.sub || !profile.email || profile.email_verified !== true) {
      throw new UnauthorizedException('A verified Google email is required');
    }

    const user = await this.prisma.user.upsert({
      where: { googleSub: profile.sub },
      create: {
        googleSub: profile.sub,
        email: profile.email,
        displayName: profile.name?.trim() || profile.email.split('@')[0],
        avatarUrl: profile.picture ?? null,
      },
      update: {
        email: profile.email,
        displayName: profile.name?.trim() || profile.email.split('@')[0],
        avatarUrl: profile.picture ?? null,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    const sessionToken = randomBytes(32).toString('base64url');
    await this.prisma.authSession.create({
      data: {
        tokenHash: this.hashToken(sessionToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      },
    });

    return { sessionToken, user };
  }

  async currentUser(
    sessionToken: string | undefined,
  ): Promise<AuthenticatedUser | null> {
    if (!sessionToken) return null;
    const session = await this.prisma.authSession.findFirst({
      where: {
        tokenHash: this.hashToken(sessionToken),
        expiresAt: { gt: new Date() },
      },
      select: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });
    return session?.user ?? null;
  }

  async logout(sessionToken: string | undefined): Promise<void> {
    if (!sessionToken) return;
    await this.prisma.authSession.deleteMany({
      where: { tokenHash: this.hashToken(sessionToken) },
    });
  }

  get appUrl(): string {
    return (
      this.config.get<string>('PUBLIC_APP_URL')?.replace(/\/$/, '') ||
      'http://localhost:4200'
    );
  }

  private requiredConfig(name: string): string {
    const value = this.config.get<string>(name);
    if (!value) {
      throw new ServiceUnavailableException(`${name} is not configured`);
    }
    return value;
  }

  private statesMatch(
    returnedState: string | undefined,
    expectedState: string | undefined,
  ): boolean {
    if (!returnedState || !expectedState) return false;
    const returned = Buffer.from(returnedState);
    const expected = Buffer.from(expectedState);
    return (
      returned.length === expected.length && timingSafeEqual(returned, expected)
    );
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
