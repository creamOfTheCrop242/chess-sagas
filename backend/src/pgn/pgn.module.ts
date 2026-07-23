import { Module } from '@nestjs/common';
import { PgnController } from './pgn.controller';
import { PgnService } from './pgn.service';

@Module({
  controllers: [PgnController],
  providers: [PgnService],
})
export class PgnModule {}
