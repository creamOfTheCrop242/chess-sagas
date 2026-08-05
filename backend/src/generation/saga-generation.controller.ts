import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { SagaGenerationService } from './saga-generation.service';

@Controller('games/:gameId/generation')
export class SagaGenerationController {
  constructor(private readonly generation: SagaGenerationService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  start(@Param('gameId') gameId: string) {
    return this.generation.start(gameId);
  }

  @Get()
  status(@Param('gameId') gameId: string) {
    return this.generation.status(gameId);
  }
}
