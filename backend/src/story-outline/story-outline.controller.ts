import { Controller, Get, Param, Post } from '@nestjs/common';
import { StoryOutlineService } from './story-outline.service';

@Controller('games/:gameId/outline')
export class StoryOutlineController {
  constructor(private readonly outlines: StoryOutlineService) {}

  @Post()
  generate(@Param('gameId') gameId: string) {
    return this.outlines.generate(gameId);
  }

  @Get()
  findLatest(@Param('gameId') gameId: string) {
    return this.outlines.findLatest(gameId);
  }
}
