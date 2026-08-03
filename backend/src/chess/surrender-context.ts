import { Chess } from 'chess.js';
import type { GameLedger } from './models/game-ledger';
import type { DefeatedKingFate } from './models/story-ending';

export const SURRENDER_JUDGMENTS = [
  'necessary',
  'reasonable',
  'questionable',
  'premature',
] as const;

export type SurrenderJudgment = (typeof SURRENDER_JUDGMENTS)[number];

export interface SurrenderContext {
  judgment: SurrenderJudgment;
  materialBalance: number;
  legalMoveCount: number;
  inCheck: boolean;
  safeFromImmediateMateMoveCount: number;
  allowedFates: DefeatedKingFate[];
  rationale: string;
}

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 } as const;

export function classifySurrender(ledger: GameLedger): SurrenderContext | null {
  if (ledger.metadata.termination !== 'resignation') return null;

  const defeatedColor = ledger.metadata.result === '1-0' ? 'b' : 'w';
  const fenParts = ledger.finalFen.split(' ');
  fenParts[1] = defeatedColor;
  const evaluationFen = fenParts.join(' ');
  const chess = new Chess(evaluationFen);
  const materialBalance = chess
    .board()
    .flat()
    .reduce((total, piece) => {
      if (!piece) return total;
      const value = VALUE[piece.type];
      return total + (piece.color === defeatedColor ? value : -value);
    }, 0);
  const legalMoves = chess.moves();
  const safeFromImmediateMateMoveCount = legalMoves.filter((move) => {
    const afterDefense = new Chess(evaluationFen);
    afterDefense.move(move);
    return !afterDefense.moves().some((reply) => {
      const afterReply = new Chess(afterDefense.fen());
      afterReply.move(reply);
      return afterReply.isCheckmate();
    });
  }).length;
  const inCheck = chess.inCheck();

  let judgment: SurrenderJudgment;
  if (
    safeFromImmediateMateMoveCount === 0 ||
    (inCheck && legalMoves.length <= 2) ||
    (materialBalance <= -10 && legalMoves.length <= 10)
  ) {
    judgment = 'necessary';
  } else if (
    materialBalance <= -5 ||
    (inCheck && legalMoves.length <= 5) ||
    safeFromImmediateMateMoveCount <= Math.max(1, legalMoves.length / 4)
  ) {
    judgment = 'reasonable';
  } else if (materialBalance <= -2 || inCheck) {
    judgment = 'questionable';
  } else {
    judgment = 'premature';
  }

  return {
    judgment,
    materialBalance,
    legalMoveCount: legalMoves.length,
    inCheck,
    safeFromImmediateMateMoveCount,
    allowedFates: [...allowedSurrenderFates(judgment)],
    rationale: surrenderRationale(
      judgment,
      materialBalance,
      legalMoves.length,
      inCheck,
      safeFromImmediateMateMoveCount,
    ),
  };
}

export function allowedSurrenderFates(
  judgment: SurrenderJudgment,
): readonly DefeatedKingFate[] {
  if (judgment === 'necessary') {
    return [
      'breaks-seal-and-accepts-captivity',
      'refuses-seal-destruction-and-is-imprisoned',
      'spends-seal-to-save-subjects',
    ];
  }
  if (judgment === 'reasonable') {
    return [
      'breaks-seal-and-accepts-captivity',
      'abandons-seal-and-flees',
      'refuses-seal-destruction-and-is-imprisoned',
      'spends-seal-to-save-subjects',
    ];
  }
  if (judgment === 'questionable') {
    return [
      'breaks-seal-and-accepts-captivity',
      'abandons-seal-and-flees',
      'refuses-seal-destruction-and-is-imprisoned',
      'shatters-seal-in-defiance',
      'executed-after-rejected-surrender',
    ];
  }
  return [
    'abandons-seal-and-flees',
    'refuses-seal-destruction-and-is-imprisoned',
    'shatters-seal-in-defiance',
    'executed-after-rejected-surrender',
  ];
}

function surrenderRationale(
  judgment: SurrenderJudgment,
  materialBalance: number,
  legalMoveCount: number,
  inCheck: boolean,
  safeMoveCount: number,
): string {
  const material =
    materialBalance === 0
      ? 'material was level'
      : `the defeated side's material balance was ${materialBalance}`;
  const pressure = inCheck
    ? 'the King was under check'
    : 'the King was not in check';
  return `The surrender was ${judgment}: ${material}, ${pressure}, ${legalMoveCount} legal moves remained, and ${safeMoveCount} avoided an immediate mating reply.`;
}
