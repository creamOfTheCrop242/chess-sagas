import { GameLedgerService } from '../chess/game-ledger.service';
import { PieceIdentityService } from '../chess/piece-identity.service';
import { PgnService } from '../pgn/pgn.service';
import {
  compactGameLedgerForModel,
  estimateOpenAiCostMicros,
  serializeRequestWithoutTelemetry,
  serializeRequestWithCharacterRegistry,
  safelyCompactGameLedgerForModel,
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

  it('deduplicates intermediate capture and check board snapshots without changing event facts', () => {
    const compact = safelyCompactGameLedgerForModel(ledger, true, {
      deduplicateBoardSnapshots: true,
    });

    expect(compact.events).toHaveLength(ledger.events.length);
    expect(compact.events[2].isCapture).toBe(true);
    expect(compact.events[2].capturedPieceId).toBe(
      ledger.events[2].capturedPieceId,
    );
    expect(compact.events[2].boardFenAfterMove).toBeUndefined();
    expect(compact.events[3].isCapture).toBe(true);
    expect(compact.events[3].boardFenAfterMove).toBeUndefined();
    expect(compact.events.at(-1)?.boardFenAfterMove).toBe(ledger.finalFen);
    expect(compact.events.map(withoutBoardSnapshot)).toEqual(
      ledger.events.map(withoutBoardSnapshot),
    );
  });

  it('retains exact promotion and checkmate board geometry in deduplicated mode', () => {
    const promotionLedger = pgn.parse(
      '[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n[Result "*"]\n\n1. a8=Q+ *',
    ).ledger;
    const mateLedger = pgn.parse(
      '[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1',
    ).ledger;
    const compactPromotion = safelyCompactGameLedgerForModel(
      promotionLedger,
      true,
      { deduplicateBoardSnapshots: true },
    );
    const compactMate = safelyCompactGameLedgerForModel(mateLedger, true, {
      deduplicateBoardSnapshots: true,
    });

    expect(compactPromotion.events.at(-1)?.boardFenAfterMove).toBe(
      promotionLedger.finalFen,
    );
    expect(compactMate.events.at(-1)?.boardFenAfterMove).toBe(
      mateLedger.finalFen,
    );
    expect(compactMate.events.at(-1)?.checkmateExplanation).toEqual(
      mateLedger.events.at(-1)?.checkmateExplanation,
    );
  });

  it('keeps the existing payload unchanged unless compaction is enabled', () => {
    const current = serializeRequestWithoutTelemetry({ ledger });
    const explicitCurrent = serializeRequestWithoutTelemetry(
      { ledger },
      { deduplicateBoardSnapshots: false },
    );
    const compact = serializeRequestWithoutTelemetry(
      { ledger },
      { deduplicateBoardSnapshots: true },
    );

    expect(explicitCurrent).toBe(current);
    expect(compact.length).toBeLessThan(current.length);
  });
});

describe('OpenAI generation cost estimation', () => {
  it('separates uncached, cached, cache-write, and output tokens', () => {
    expect(
      estimateOpenAiCostMicros({
        model: 'gpt-5.6-terra',
        inputTokens: 10_000,
        cachedInputTokens: 2_000,
        cacheWriteTokens: 3_000,
        outputTokens: 4_000,
      }),
    ).toBe(82_375);
  });

  it('returns zero for an unpriced model', () => {
    expect(
      estimateOpenAiCostMicros({
        model: 'unknown',
        inputTokens: 100,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 100,
      }),
    ).toBe(0);
  });
});

function withoutBoardSnapshot<T extends { boardFenAfterMove?: string }>(
  event: T,
): Omit<T, 'boardFenAfterMove'> {
  const copy = { ...event };
  delete copy.boardFenAfterMove;
  return copy;
}
