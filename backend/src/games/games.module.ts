import { Module } from '@nestjs/common';
import { PgnModule } from '../pgn/pgn.module';
import { AuthModule } from '../auth/auth.module';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

@Module({
  imports: [PgnModule, AuthModule],
  controllers: [GamesController],
  providers: [GamesService],
})
export class GamesModule {}
