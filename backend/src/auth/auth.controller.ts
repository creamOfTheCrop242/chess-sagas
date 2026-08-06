import {
  Controller,
  Get,
  Header,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';

const OAUTH_STATE_COOKIE = 'chess_sagas_oauth_state';
const SESSION_COOKIE = 'chess_sagas_session';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly auth: AuthService) {}

  @Get('google')
  @Header('Cache-Control', 'no-store')
  beginGoogleLogin(@Res() response: Response): void {
    const request = this.auth.createAuthorizationRequest();
    response.cookie(OAUTH_STATE_COOKIE, request.state, {
      ...this.cookieOptions(),
      maxAge: 10 * 60 * 1000,
    });
    response.redirect(request.url);
  }

  @Get('google/callback')
  @Header('Cache-Control', 'no-store')
  async finishGoogleLogin(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    try {
      if (error) throw new Error(`Google returned ${error}`);
      const result = await this.auth.completeGoogleLogin(
        code,
        state,
        this.readCookie(request, OAUTH_STATE_COOKIE),
      );
      response.clearCookie(OAUTH_STATE_COOKIE, this.cookieOptions());
      response.cookie(SESSION_COOKIE, result.sessionToken, {
        ...this.cookieOptions(),
        maxAge: SESSION_MAX_AGE_MS,
      });
      response.redirect(`${this.auth.appUrl}/`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      this.logger.warn(`Google login failed: ${message}`);
      response.clearCookie(OAUTH_STATE_COOKIE, this.cookieOptions());
      response.redirect(
        `${this.auth.appUrl}/login?error=authentication_failed`,
      );
    }
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  async me(
    @Req() request: Request,
  ): Promise<{ user: Awaited<ReturnType<AuthService['currentUser']>> }> {
    return {
      user: await this.auth.currentUser(
        this.readCookie(request, SESSION_COOKIE),
      ),
    };
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.auth.logout(this.readCookie(request, SESSION_COOKIE));
    response.clearCookie(SESSION_COOKIE, this.cookieOptions());
    response.status(204).send();
  }

  private cookieOptions(): {
    httpOnly: true;
    sameSite: 'lax';
    secure: boolean;
    path: '/';
  } {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    };
  }

  private readCookie(request: Request, name: string): string | undefined {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return undefined;
    for (const pair of cookieHeader.split(';')) {
      const separator = pair.indexOf('=');
      if (separator < 0) continue;
      if (pair.slice(0, separator).trim() === name) {
        return decodeURIComponent(pair.slice(separator + 1).trim());
      }
    }
    return undefined;
  }
}
