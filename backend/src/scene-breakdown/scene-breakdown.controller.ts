import { Controller, Get, Param, Post } from '@nestjs/common';
import { SceneBreakdownService } from './scene-breakdown.service';
@Controller('games/:gameId/scenes')
export class SceneBreakdownController {
  constructor(private readonly scenes: SceneBreakdownService) {}
  @Post() generate(@Param('gameId') gameId: string) {
    return this.scenes.generate(gameId);
  }
  @Get() latest(@Param('gameId') gameId: string) {
    return this.scenes.findLatest(gameId);
  }
}
