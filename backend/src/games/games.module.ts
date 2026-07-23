import { Module } from '@nestjs/common';
import { PgnModule } from '../pgn/pgn.module';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

@Module({
  imports: [PgnModule],
  controllers: [GamesController],
  providers: [GamesService],
})
export class GamesModule {}
