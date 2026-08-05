import { GameLedgerService } from '../chess/game-ledger.service';
import { PieceIdentityService } from '../chess/piece-identity.service';
import { PgnService } from '../pgn/pgn.service';
import {
  compactGameLedgerForModel,
  serializeRequestWithoutTelemetry,
  serializeRequestWithCharacterRegistry,
} from './openai-generation';

describe('OpenAI generation request serialization', () => {
  const pgn = new PgnService(new GameLedgerService(new PieceIdentityService()));
  const ledger = pgn.parse(
    '[White "Ada"]\n[Black "Turing"]\n[Result "*"]\n\n1. e4 d5 2. exd5 Qxd5 3. Nf3 *',
  ).ledger;

  it('sends the character registry once without losing ledger facts', () => {
    const serialized = serializeRequestWithCharacterRegistry({
      ledger,
      characterRegistry: ledger.pieces,
      outline: {
        title: 'The Opening',
        woundBeats: [{ pieceId: 'w-p-e2', inflictedAtPly: 3 }],
      },
      telemetry: {
        gameId: 'game-1',
        generationRunId: 'run-1',
        attempt: 1,
        repairMode: 'none' as const,
      },
    });

    const request = JSON.parse(serialized) as {
      ledger: typeof ledger & { pieces?: unknown[] };
      characterRegistry: typeof ledger.pieces;
      outline: {
        title: string;
        woundBeats: Array<{ pieceId: string; inflictedAtPly: number }>;
      };
      telemetry?: unknown;
    };

    expect(request.ledger.pieces).toBeUndefined();
    expect(request.ledger.metadata).toEqual(ledger.metadata);
    expect(request.ledger.initialFen).toBe(ledger.initialFen);
    expect(request.ledger.finalFen).toBe(ledger.finalFen);
    expect(request.ledger.survivors).toEqual(ledger.survivors);
    expect(request.ledger.capturedPieces).toEqual(ledger.capturedPieces);
    expect(request.ledger.events).toHaveLength(ledger.events.length);
    expect(request.ledger.events.map(withoutBoardSnapshot)).toEqual(
      ledger.events.map(withoutBoardSnapshot),
    );
    expect(request.characterRegistry).toEqual(ledger.pieces);
    expect(request.outline.woundBeats).toEqual([
      { pieceId: 'w-p-e2', inflictedAtPly: 3 },
    ]);
    expect(request.telemetry).toBeUndefined();
  });

  it('keeps pieces but removes telemetry for validation-style inputs', () => {
    const serialized = serializeRequestWithoutTelemetry({
      ledger,
      storyMarkdown: 'A battle begins.',
      telemetry: {
        gameId: 'game-1',
        generationRunId: 'run-1',
        attempt: 2,
        repairMode: 'full' as const,
      },
    });
    const request = JSON.parse(serialized) as {
      ledger: typeof ledger;
      storyMarkdown: string;
      telemetry?: unknown;
    };

    expect(request.ledger.pieces).toEqual(ledger.pieces);
    expect(request.storyMarkdown).toBe('A battle begins.');
    expect(request.telemetry).toBeUndefined();
  });

  it('retains board snapshots only for significant events and the final ply', () => {
    const compact = compactGameLedgerForModel(ledger);

    expect(compact.events.map((event) => 'boardFenAfterMove' in event)).toEqual(
      [false, false, true, true, true],
    );
    expect(compact.events[2].isCapture).toBe(true);
    expect(compact.events[3].isCapture).toBe(true);
    expect(compact.events.at(-1)?.boardFenAfterMove).toBe(ledger.finalFen);
  });

  it('preserves exact checkmate geometry and custom starting positions', () => {
    const customLedger = pgn.parse(
      '[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n[Result "*"]\n\n1. a8=Q+ *',
    ).ledger;
    const compact = compactGameLedgerForModel(customLedger);
    const mateLedger = pgn.parse(
      '[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1',
    ).ledger;
    const compactMate = compactGameLedgerForModel(mateLedger);

    expect(compact.initialFen).toBe(customLedger.initialFen);
    expect(compact.finalFen).toBe(customLedger.finalFen);
    expect(compact.events.at(-1)?.isPromotion).toBe(true);
    expect(compactMate.events.at(-1)?.checkmateExplanation).toEqual(
      mateLedger.events.at(-1)?.checkmateExplanation,
    );
    expect(compactMate.events.at(-1)?.boardFenAfterMove).toBe(
      mateLedger.events.at(-1)?.boardFenAfterMove,
    );
  });

  it('reduces serialized ledger size without removing events', () => {
    const compact = compactGameLedgerForModel(ledger);

    expect(JSON.stringify(compact).length).toBeLessThan(
      JSON.stringify(ledger).length,
    );
    expect(compact.events).toHaveLength(ledger.events.length);
  });
});

function withoutBoardSnapshot<T extends { boardFenAfterMove?: string }>(
  event: T,
): Omit<T, 'boardFenAfterMove'> {
  const copy = { ...event };
  delete copy.boardFenAfterMove;
  return copy;
}
