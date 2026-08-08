import {
  Controller,
  Get,
  Param,
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sagas.findPublic(id);
  }
}
