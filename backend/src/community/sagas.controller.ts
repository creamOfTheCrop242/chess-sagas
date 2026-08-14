import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { readCookie, SESSION_COOKIE } from '../auth/session-cookie';
import { parseSagaListQuery } from './community-query';
import type { SagaListQuery } from './community-query';
import { SagasService } from './sagas.service';

@Controller('sagas')
export class SagasController {
  constructor(
    private readonly sagas: SagasService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  list(@Query() query: SagaListQuery) {
    return this.sagas.listPublic(parseSagaListQuery(query));
  }

  @Get('mine')
  async mine(@Query() query: SagaListQuery, @Req() request: Request) {
    const user = await this.auth.currentUser(
      readCookie(request, SESSION_COOKIE),
    );
    if (!user) throw new UnauthorizedException('Sign in to view your sagas');
    return this.sagas.listMine(user.id, parseSagaListQuery(query));
  }

  @Get('saved')
  async saved(@Query() query: SagaListQuery, @Req() request: Request) {
    const user = await this.requireUser(request, 'Sign in to view saved sagas');
    return this.sagas.listSaved(user.id, parseSagaListQuery(query));
  }

  @Get('champions')
  champions(
    @Query('side') side?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
  ) {
    return this.sagas.champions({ side, type, limit });
  }

  @Get('champions/stats')
  championStats() {
    return this.sagas.championStats();
  }

  @Post(':id/bookmark')
  async bookmark(@Param('id') id: string, @Req() request: Request) {
    const user = await this.requireUser(request, 'Sign in to save sagas');
    return this.sagas.bookmark(user.id, id);
  }

  @Delete(':id/bookmark')
  async removeBookmark(@Param('id') id: string, @Req() request: Request) {
    const user = await this.requireUser(
      request,
      'Sign in to manage saved sagas',
    );
    return this.sagas.removeBookmark(user.id, id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() request: Request) {
    const user = await this.auth.currentUser(
      readCookie(request, SESSION_COOKIE),
    );
    return this.sagas.findAccessible(id, user?.id);
  }

  private async requireUser(request: Request, message: string) {
    const user = await this.auth.currentUser(
      readCookie(request, SESSION_COOKIE),
    );
    if (!user) throw new UnauthorizedException(message);
    return user;
  }
}
