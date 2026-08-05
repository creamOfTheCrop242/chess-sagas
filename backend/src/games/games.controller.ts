import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateGameDto } from './dto/create-game.dto';
import { GamesService } from './games.service';

@Controller('games')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Post()
  create(@Body() body: CreateGameDto) {
    return this.games.create(body?.pgn);
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
