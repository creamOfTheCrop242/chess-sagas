import { Module } from '@nestjs/common';
import { PgnController } from './pgn.controller';
import { PgnService } from './pgn.service';
import { GameLedgerService } from '../chess/game-ledger.service';
import { PieceIdentityService } from '../chess/piece-identity.service';

@Module({
  controllers: [PgnController],
  providers: [PgnService, GameLedgerService, PieceIdentityService],
  exports: [PgnService],
})
export class PgnModule {}
