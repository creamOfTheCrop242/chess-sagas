import { Injectable } from '@nestjs/common';
import type { GameLedger } from '../chess/models/game-ledger';
import type { ValidationFinding } from './models/story-validation';

@Injectable()
export class DeterministicStoryValidator {
  validate(storyMarkdown: string, ledger: GameLedger): ValidationFinding[] {
    const findings: ValidationFinding[] = [];
    const add = (
      type: ValidationFinding['type'],
      message: string,
      excerpt: string,
    ) =>
      findings.push({
        type,
        severity: 'error',
        message,
        ply: null,
        pieceId: null,
        excerpt,
      });

    const coordinate = storyMarkdown.match(/\b[a-h][1-8]\b/i)?.[0];
    if (coordinate) {
      add(
        'coordinate-mentioned-in-prose',
        'Reader-facing prose contains a board coordinate',
        coordinate,
      );
    }
    const chessTerm = storyMarkdown.match(
      /\b(?:chess|checkmate|SAN|FEN|ply|plies|[A-H]-file|file company)\b/i,
    )?.[0];
    if (chessTerm) {
      add(
        'chess-terminology',
        'Reader-facing prose contains chess-derived terminology',
        chessTerm,
      );
    }
    const leakedPiece = ledger.pieces.find((piece) =>
      storyMarkdown.includes(piece.id),
    );
    if (leakedPiece) {
      findings.push({
        type: 'inconsistent-piece-name',
        severity: 'error',
        message: 'Reader-facing prose exposes an internal piece ID',
        ply: null,
        pieceId: leakedPiece.id,
        excerpt: leakedPiece.id,
      });
    }
    return findings;
  }
}
