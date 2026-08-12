import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { readCookie, SESSION_COOKIE } from '../auth/session-cookie';
import { SagaGenerationService } from './saga-generation.service';

@Controller('games/:gameId/generation')
export class SagaGenerationController {
  constructor(
    private readonly generation: SagaGenerationService,
    private readonly auth: AuthService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async start(
    @Param('gameId') gameId: string,
    @Body() body: { pushSubscription?: unknown },
    @Req() request: Request,
  ) {
    const user = await this.auth.currentUser(
      readCookie(request, SESSION_COOKIE),
    );
    return this.generation.start(
      gameId,
      body?.pushSubscription,
      user,
      requestIp(request),
    );
  }

  @Get()
  status(@Param('gameId') gameId: string) {
    return this.generation.status(gameId);
  }
}

function requestIp(request: Request): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(',')[0]?.trim() || request.ip || null;
}
