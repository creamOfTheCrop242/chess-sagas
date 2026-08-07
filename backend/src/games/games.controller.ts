import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { readCookie, SESSION_COOKIE } from '../auth/session-cookie';
import { CreateGameDto } from './dto/create-game.dto';
import { GamesService } from './games.service';

@Controller('games')
export class GamesController {
  constructor(
    private readonly games: GamesService,
    private readonly auth: AuthService,
  ) {}

  @Post()
  async create(@Body() body: CreateGameDto, @Req() request: Request) {
    const user = await this.auth.currentUser(
      readCookie(request, SESSION_COOKIE),
    );
    return this.games.create(body?.pgn, user?.id);
  }

  @Get()
  findAll() {
    return this.games.findAll();
  }

  @Get('records')
  findRecords() {
    return this.games.findRecords();
  }

  @Get('records/:id')
  findRecord(@Param('id') id: string) {
    return this.games.findRecord(id);
  }

  @Get(':id/pipeline-status')
  pipelineStatus(@Param('id') id: string) {
    return this.games.pipelineStatus(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.games.findOne(id);
  }
}
