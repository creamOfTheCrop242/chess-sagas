import type { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import OpenAI from 'openai';
import type { GameLedger } from '../chess/models/game-ledger';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_MAX_RETRIES = 1;

export interface GenerationTelemetryContext {
  gameId: string;
  generationRunId: string;
  attempt: number;
  repairMode?: 'none' | 'full' | 'partial';
}

interface GenerationCallTelemetry extends GenerationTelemetryContext {
  payloadBytes: number;
}

export type OpenAiCallRecord = GenerationCallTelemetry & {
  timestamp: string;
  stage: string;
  model: string;
  status: 'SUCCEEDED' | 'FAILED';
  durationMs: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  outputTokens: number;
  error?: string;
};

export interface OpenAiTelemetryRecorder {
  record(entry: OpenAiCallRecord): void;
}

export interface ModelPayloadOptions {
  deduplicateBoardSnapshots?: boolean;
}

export function createOpenAiGenerationClient(
  apiKey: string,
  config: ConfigService,
): OpenAI {
  return new OpenAI({
    apiKey,
    timeout: positiveInteger(
      config.get<string>('OPENAI_REQUEST_TIMEOUT_MS'),
      DEFAULT_TIMEOUT_MS,
    ),
    maxRetries: nonNegativeInteger(
      config.get<string>('OPENAI_MAX_RETRIES'),
      DEFAULT_MAX_RETRIES,
    ),
  });
}

export function promptCacheOptions(model: string, key: string) {
  return {
    prompt_cache_key: key,
    ...(model.startsWith('gpt-5.6')
      ? {
          prompt_cache_options: {
            mode: 'implicit' as const,
            ttl: '30m' as const,
          },
        }
      : {}),
  };
}

export function serializeRequestWithCharacterRegistry<
  T extends {
    ledger: GameLedger;
    characterRegistry: unknown[];
    telemetry?: GenerationTelemetryContext;
  },
>(request: T, options: ModelPayloadOptions = {}): string {
  const { telemetry, ledger, ...modelRequest } = request;
  void telemetry;
  return JSON.stringify({
    ...modelRequest,
    ledger: safelyCompactGameLedgerForModel(ledger, false, options),
  });
}

export function serializeRequestWithoutTelemetry<
  T extends {
    ledger: GameLedger;
    telemetry?: GenerationTelemetryContext;
  },
>(request: T, options: ModelPayloadOptions = {}): string {
  const { telemetry, ledger, ...modelRequest } = request;
  void telemetry;
  return JSON.stringify({
    ...modelRequest,
    ledger: safelyCompactGameLedgerForModel(ledger, true, options),
  });
}

export function compactGameLedgerForModel(
  ledger: GameLedger,
  includePieces = true,
  options: ModelPayloadOptions = {},
) {
  const { pieces, events, ...ledgerWithoutEventsAndPieces } = ledger;
  return {
    ...ledgerWithoutEventsAndPieces,
    ...(includePieces ? { pieces } : {}),
    events: events.map((event, index) => {
      const { boardFenAfterMove, ...eventWithoutBoard } = event;
      return shouldRetainBoardSnapshot(event, index, events.length, options)
        ? { ...eventWithoutBoard, boardFenAfterMove }
        : eventWithoutBoard;
    }),
  };
}

function shouldRetainBoardSnapshot(
  event: GameLedger['events'][number],
  index: number,
  eventCount: number,
  options: ModelPayloadOptions,
): boolean {
  if (options.deduplicateBoardSnapshots) {
    return (
      index === eventCount - 1 ||
      event.isCheckmate ||
      event.isCastle ||
      event.isPromotion
    );
  }
  return (
    index === eventCount - 1 ||
    event.isCapture ||
    event.isCheck ||
    event.isCheckmate ||
    event.isCastle ||
    event.isPromotion
  );
}

export function losslessPayloadCompactionEnabled(config: ConfigService) {
  return config.get<string>('OPENAI_LOSSLESS_PAYLOAD_COMPACTION') === 'true';
}

export function safelyCompactGameLedgerForModel(
  ledger: GameLedger,
  includePieces: boolean,
  options: ModelPayloadOptions,
) {
  if (!options.deduplicateBoardSnapshots) {
    return compactGameLedgerForModel(ledger, includePieces);
  }

  try {
    const compact = compactGameLedgerForModel(ledger, includePieces, options);
    assertLosslessEventFacts(ledger, compact.events);
    return compact;
  } catch {
    return compactGameLedgerForModel(ledger, includePieces);
  }
}

function assertLosslessEventFacts(
  ledger: GameLedger,
  compactEvents: Array<
    Omit<GameLedger['events'][number], 'boardFenAfterMove'> & {
      boardFenAfterMove?: string;
    }
  >,
): void {
  if (compactEvents.length !== ledger.events.length) {
    throw new Error('Ledger compaction changed the event count');
  }

  ledger.events.forEach((event, index) => {
    const { boardFenAfterMove, ...expectedFacts } = event;
    const compactEvent = compactEvents[index];
    if (!compactEvent) throw new Error('Ledger compaction removed an event');
    const { boardFenAfterMove: compactBoard, ...actualFacts } = compactEvent;
    if (JSON.stringify(actualFacts) !== JSON.stringify(expectedFacts)) {
      throw new Error(`Ledger compaction changed facts at ply ${event.ply}`);
    }
    if (
      shouldRetainBoardSnapshot(event, index, ledger.events.length, {
        deduplicateBoardSnapshots: true,
      }) &&
      compactBoard !== boardFenAfterMove
    ) {
      throw new Error(
        `Ledger compaction changed board state at ply ${event.ply}`,
      );
    }
  });
}

export function logOpenAiGeneration(
  logger: Logger,
  stage: string,
  model: string,
  startedAt: number,
  response: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      output_tokens_details?: { reasoning_tokens?: number };
      input_tokens_details?: {
        cached_tokens?: number;
        cache_write_tokens?: number;
      };
    } | null;
  },
  telemetry: GenerationCallTelemetry,
  recorder?: OpenAiTelemetryRecorder,
): void {
  const usage = response.usage;
  const durationMs = Date.now() - startedAt;
  logger.log(
    [
      `OpenAI ${stage} completed`,
      `model=${model}`,
      `durationMs=${durationMs}`,
      `inputTokens=${usage?.input_tokens ?? 0}`,
      `cachedInputTokens=${usage?.input_tokens_details?.cached_tokens ?? 0}`,
      `cacheWriteTokens=${usage?.input_tokens_details?.cache_write_tokens ?? 0}`,
      `reasoningTokens=${usage?.output_tokens_details?.reasoning_tokens ?? 0}`,
      `outputTokens=${usage?.output_tokens ?? 0}`,
      `payloadBytes=${telemetry.payloadBytes}`,
      `gameId=${telemetry.gameId}`,
      `attempt=${telemetry.attempt}`,
    ].join(' '),
  );
  const entry: OpenAiCallRecord = {
    timestamp: new Date().toISOString(),
    stage,
    model,
    status: 'SUCCEEDED',
    durationMs,
    inputTokens: usage?.input_tokens ?? 0,
    cachedInputTokens: usage?.input_tokens_details?.cached_tokens ?? 0,
    cacheWriteTokens: usage?.input_tokens_details?.cache_write_tokens ?? 0,
    reasoningTokens: usage?.output_tokens_details?.reasoning_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    ...telemetry,
  };
  appendOpenAiCallLog(entry);
  recorder?.record(entry);
}

export function logOpenAiGenerationFailure(
  logger: Logger,
  stage: string,
  model: string,
  startedAt: number,
  error: unknown,
  telemetry: GenerationCallTelemetry,
  recorder?: OpenAiTelemetryRecorder,
): void {
  const durationMs = Date.now() - startedAt;
  const message =
    error instanceof Error ? error.message : 'Unknown OpenAI call failure';
  logger.error(
    `OpenAI ${stage} failed model=${model} durationMs=${durationMs} error=${message}`,
  );
  const entry: OpenAiCallRecord = {
    timestamp: new Date().toISOString(),
    stage,
    model,
    status: 'FAILED',
    durationMs,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    outputTokens: 0,
    error: message,
    ...telemetry,
  };
  appendOpenAiCallLog(entry);
  recorder?.record(entry);
}

export function estimateOpenAiCostMicros(
  entry: Pick<
    OpenAiCallRecord,
    | 'model'
    | 'inputTokens'
    | 'cachedInputTokens'
    | 'cacheWriteTokens'
    | 'outputTokens'
  >,
): number {
  const rates = {
    'gpt-5.6-luna': { input: 1, cached: 0.1, write: 1.25, output: 6 },
    'gpt-5.6-terra': { input: 2.5, cached: 0.25, write: 3.125, output: 15 },
    'gpt-5.6-sol': { input: 5, cached: 0.5, write: 6.25, output: 30 },
  }[entry.model];
  if (!rates) return 0;
  const cached = entry.cachedInputTokens || 0;
  const write = entry.cacheWriteTokens || 0;
  const uncached = Math.max(0, entry.inputTokens - cached - write);
  const dollars =
    (uncached * rates.input +
      cached * rates.cached +
      write * rates.write +
      entry.outputTokens * rates.output) /
    1_000_000;
  return Math.round(dollars * 1_000_000);
}

function appendOpenAiCallLog(entry: { timestamp: string }): void {
  try {
    const directory =
      process.env.AI_CALL_LOG_DIR || join(process.cwd(), 'logs');
    mkdirSync(directory, { recursive: true });
    const date = String(entry.timestamp).slice(0, 10);
    appendFileSync(
      join(directory, `openai-calls-${date}.jsonl`),
      `${JSON.stringify(entry)}\n`,
      'utf8',
    );
  } catch {
    // Telemetry must never interrupt story generation.
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
