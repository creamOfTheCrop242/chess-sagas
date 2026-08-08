import {
  Controller,
  Body,
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
import { readCookie, SESSION_COOKIE } from './session-cookie';

const OAUTH_STATE_COOKIE = 'chess_sagas_oauth_state';
const APPLE_STATE_COOKIE = 'chess_sagas_apple_oauth_state';
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

  @Get('apple')
  @Header('Cache-Control', 'no-store')
  beginAppleLogin(@Res() response: Response): void {
    const request = this.auth.createAppleAuthorizationRequest();
    response.cookie(APPLE_STATE_COOKIE, request.state, {
      ...this.appleStateCookieOptions(),
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
        readCookie(request, OAUTH_STATE_COOKIE),
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

  @Post('apple/callback')
  @Header('Cache-Control', 'no-store')
  async finishAppleLogin(
    @Body()
    body: {
      code?: string;
      state?: string;
      user?: string;
      error?: string;
    },
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    try {
      if (body.error) throw new Error(`Apple returned ${body.error}`);
      const result = await this.auth.completeAppleLogin(
        body.code,
        body.state,
        readCookie(request, APPLE_STATE_COOKIE),
        body.user,
      );
      response.clearCookie(APPLE_STATE_COOKIE, this.appleStateCookieOptions());
      response.cookie(SESSION_COOKIE, result.sessionToken, {
        ...this.cookieOptions(),
        maxAge: SESSION_MAX_AGE_MS,
      });
      response.redirect(`${this.auth.appUrl}/`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      this.logger.warn(`Apple login failed: ${message}`);
      response.clearCookie(APPLE_STATE_COOKIE, this.appleStateCookieOptions());
      response.redirect(
        `${this.auth.appUrl}/login?error=authentication_failed`,
      );
    }
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  async me(
    @Req() request: Request,
  ): Promise<{ user: ReturnType<AuthService['withAccessFlags']> | null }> {
    const user = await this.auth.currentUser(
      readCookie(request, SESSION_COOKIE),
    );
    return {
      user: user ? this.auth.withAccessFlags(user) : null,
    };
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.auth.logout(readCookie(request, SESSION_COOKIE));
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

  private appleStateCookieOptions(): {
    httpOnly: true;
    sameSite: 'none';
    secure: true;
    path: '/';
  } {
    return {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      path: '/',
    };
  }
}
