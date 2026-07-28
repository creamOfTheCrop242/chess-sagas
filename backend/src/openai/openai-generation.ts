import type { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import OpenAI from 'openai';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_MAX_RETRIES = 1;

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
    ledger: { pieces: unknown[] };
    characterRegistry: unknown[];
  },
>(request: T): string {
  const { pieces: _duplicatePieces, ...ledgerWithoutPieces } = request.ledger;
  return JSON.stringify({
    ...request,
    ledger: ledgerWithoutPieces,
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
    ].join(' '),
  );
  appendOpenAiCallLog({
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
  });
}

export function logOpenAiGenerationFailure(
  logger: Logger,
  stage: string,
  model: string,
  startedAt: number,
  error: unknown,
): void {
  const durationMs = Date.now() - startedAt;
  const message =
    error instanceof Error ? error.message : 'Unknown OpenAI call failure';
  logger.error(
    `OpenAI ${stage} failed model=${model} durationMs=${durationMs} error=${message}`,
  );
  appendOpenAiCallLog({
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
  });
}

function appendOpenAiCallLog(entry: Record<string, unknown>): void {
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
