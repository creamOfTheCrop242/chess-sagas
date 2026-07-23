import { Controller, Get, Param, Post } from '@nestjs/common';
import { NarrativeAnalysisService } from './narrative-analysis.service';

@Controller('games/:gameId/analysis')
export class NarrativeAnalysisController {
  constructor(private readonly analysis: NarrativeAnalysisService) {}

  @Post()
  generate(@Param('gameId') gameId: string) {
    return this.analysis.generate(gameId);
  }

  @Get()
  findLatest(@Param('gameId') gameId: string) {
    return this.analysis.findLatest(gameId);
  }
}
