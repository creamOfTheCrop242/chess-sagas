import { Injectable } from '@nestjs/common';
import type { GameLedger } from '../chess/models/game-ledger';
import type { ValidationFinding } from './models/story-validation';

@Injectable()
export class DeterministicStoryValidator {
  repairProhibitedTerminology(storyMarkdown: string): string {
    return storyMarkdown
      .replace(/\bcheckmate\b/gi, 'final defeat')
      .replace(/\bchess\b/gi, 'war')
      .replace(/\bSAN\b/g, 'battle record')
      .replace(/\bFEN\b/g, 'battle formation')
      .replace(/\bplies\b/gi, 'turns')
      .replace(/\bply\b/gi, 'turn')
      .replace(/\b[A-H]-file\b/gi, 'battlefront')
      .replace(/\bfile company\b/gi, 'soldier company');
  }

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

  validateTimedCharacterFates(
    scenes: Array<{ ply: number; fantasyNarration: string }>,
    ledger: GameLedger,
  ): ValidationFinding[] {
    const findings: ValidationFinding[] = [];
    for (const scene of scenes) {
      for (const piece of ledger.pieces) {
        if (
          piece.capturedAtPly !== undefined &&
          piece.capturedAtPly <= scene.ply
        ) {
          continue;
        }
        const names = [
          piece.permanentName,
          piece.viewpointName,
          piece.operatorName,
        ].filter(
          (name, index, all): name is string =>
            Boolean(name) && all.indexOf(name) === index,
        );
        const excerpt = names
          .map((name) => prematureDeathExcerpt(scene.fantasyNarration, name))
          .find((match): match is string => Boolean(match));
        if (!excerpt) continue;
        findings.push({
          type:
            piece.capturedAtPly === undefined
              ? 'survivor-killed'
              : 'invented-capture',
          severity: 'error',
          message:
            piece.capturedAtPly === undefined
              ? `${piece.permanentName} survives the ledger but is described as dead`
              : `${piece.permanentName} is described as dead before capture at ply ${piece.capturedAtPly}`,
          ply: scene.ply,
          pieceId: piece.id,
          excerpt,
        });
      }
    }
    return findings;
  }
}

function prematureDeathExcerpt(
  narration: string,
  characterName: string,
): string | undefined {
  const name = escapeRegex(characterName);
  const patterns = [
    new RegExp(
      `\\b(?:dead|slain|lifeless|deceased)\\s+${name}(?:['’]s)?\\b`,
      'i',
    ),
    new RegExp(
      `\\b${name}(?:['’]s)?\\s+(?:death|corpse|remains|grave|funeral)\\b`,
      'i',
    ),
    new RegExp(
      `\\b(?:death|corpse|remains|grave|funeral)\\s+of\\s+(?:the\\s+)?${name}\\b`,
      'i',
    ),
    new RegExp(
      `\\b${name}\\s+(?:was|is|lay|lies|fell|had\\s+been)\\s+(?:dead|slain|lifeless|killed)\\b`,
      'i',
    ),
  ];
  return patterns
    .map((pattern) => narration.match(pattern)?.[0])
    .find((match): match is string => Boolean(match));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
