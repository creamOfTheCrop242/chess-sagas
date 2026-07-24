import { Controller, Get, Param, Post } from '@nestjs/common';
import { StoryValidationService } from './story-validation.service';

@Controller('games/:gameId/validation')
export class StoryValidationController {
  constructor(private readonly validations: StoryValidationService) {}

  @Post()
  validate(@Param('gameId') gameId: string) {
    return this.validations.validate(gameId);
  }

  @Get()
  findLatest(@Param('gameId') gameId: string) {
    return this.validations.findLatest(gameId);
  }
}
