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

interface AppleTokenResponse {
  id_token?: string;
}

interface AppleIdentityClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
}

interface AppleSubmittedUser {
  name?: {
    firstName?: string;
    lastName?: string;
  };
  email?: string;
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

  createAppleAuthorizationRequest(): { state: string; url: string } {
    const clientId = this.requiredConfig('APPLE_CLIENT_ID');
    const callbackUrl = this.requiredConfig('APPLE_CALLBACK_URL');
    const state = randomBytes(32).toString('base64url');
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      response_mode: 'form_post',
      scope: 'name email',
      state,
    });
    return {
      state,
      url: `https://appleid.apple.com/auth/authorize?${query.toString()}`,
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

    const user = await this.upsertIdentity({
      provider: 'google',
      providerSub: profile.sub,
      email: profile.email,
      displayName: profile.name?.trim() || profile.email.split('@')[0],
      avatarUrl: profile.picture ?? null,
    });
    return this.createSession(user);
  }

  async completeAppleLogin(
    code: string | undefined,
    returnedState: string | undefined,
    expectedState: string | undefined,
    submittedUserJson: string | undefined,
  ): Promise<{ sessionToken: string; user: AuthenticatedUser }> {
    if (!code || !this.statesMatch(returnedState, expectedState)) {
      throw new UnauthorizedException('Invalid Apple authentication response');
    }
    const clientId = this.requiredConfig('APPLE_CLIENT_ID');
    const tokenResponse = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: await this.createAppleClientSecret(),
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.requiredConfig('APPLE_CALLBACK_URL'),
      }),
    });
    if (!tokenResponse.ok) {
      throw new BadGatewayException('Apple token exchange failed');
    }
    const tokens = (await tokenResponse.json()) as AppleTokenResponse;
    if (!tokens.id_token) {
      throw new BadGatewayException('Apple did not return an identity token');
    }

    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    const appleKeys = createRemoteJWKSet(
      new URL('https://appleid.apple.com/auth/keys'),
    );
    const verified = await jwtVerify<AppleIdentityClaims>(
      tokens.id_token,
      appleKeys,
      {
        issuer: 'https://appleid.apple.com',
        audience: clientId,
      },
    );
    const claims = verified.payload;
    const submittedUser = this.parseAppleUser(submittedUserJson);
    const email = claims.email || submittedUser?.email;
    const emailVerified =
      claims.email_verified === true || claims.email_verified === 'true';
    if (!claims.sub || !email || !emailVerified) {
      throw new UnauthorizedException('A verified Apple email is required');
    }
    const submittedName = [
      submittedUser?.name?.firstName,
      submittedUser?.name?.lastName,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();
    const user = await this.upsertIdentity({
      provider: 'apple',
      providerSub: claims.sub,
      email,
      displayName: submittedName || email.split('@')[0],
      avatarUrl: null,
    });
    return this.createSession(user);
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

  private async createAppleClientSecret(): Promise<string> {
    const { SignJWT, importPKCS8 } = await import('jose');
    const privateKey = this.requiredConfig('APPLE_PRIVATE_KEY').replace(
      /\\n/g,
      '\n',
    );
    const signingKey = await importPKCS8(privateKey, 'ES256');
    return new SignJWT({})
      .setProtectedHeader({
        alg: 'ES256',
        kid: this.requiredConfig('APPLE_KEY_ID'),
      })
      .setIssuer(this.requiredConfig('APPLE_TEAM_ID'))
      .setSubject(this.requiredConfig('APPLE_CLIENT_ID'))
      .setAudience('https://appleid.apple.com')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(signingKey);
  }

  private async upsertIdentity(input: {
    provider: 'google' | 'apple';
    providerSub: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  }): Promise<AuthenticatedUser> {
    const providerField =
      input.provider === 'google' ? 'googleSub' : 'appleSub';
    const existingProvider = await this.prisma.user.findFirst({
      where: { [providerField]: input.providerSub },
    });
    const existingEmail = existingProvider
      ? null
      : await this.prisma.user.findUnique({ where: { email: input.email } });
    const existing = existingProvider ?? existingEmail;
    const providerData = { [providerField]: input.providerSub };
    const select = {
      id: true,
      email: true,
      displayName: true,
      avatarUrl: true,
    } as const;
    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          ...providerData,
          email: input.email,
          displayName:
            input.displayName ||
            existing.displayName ||
            input.email.split('@')[0],
          avatarUrl: input.avatarUrl ?? existing.avatarUrl,
        },
        select,
      });
    }
    return this.prisma.user.create({
      data: {
        ...providerData,
        email: input.email,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
      },
      select,
    });
  }

  private async createSession(
    user: AuthenticatedUser,
  ): Promise<{ sessionToken: string; user: AuthenticatedUser }> {
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

  private parseAppleUser(value: string | undefined): AppleSubmittedUser | null {
    if (!value) return null;
    try {
      return JSON.parse(value) as AppleSubmittedUser;
    } catch {
      return null;
    }
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
