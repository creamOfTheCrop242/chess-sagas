import { Controller, Get, Param, Post } from '@nestjs/common';
import { FullStoryService } from './full-story.service';

@Controller('games/:gameId/story')
export class FullStoryController {
  constructor(private readonly stories: FullStoryService) {}

  @Post()
  generate(@Param('gameId') gameId: string) {
    return this.stories.generate(gameId);
  }

  @Get()
  findLatest(@Param('gameId') gameId: string) {
    return this.stories.findLatest(gameId);
  }
}
