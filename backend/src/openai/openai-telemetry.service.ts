import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  estimateOpenAiCostMicros,
  type OpenAiCallRecord,
  type OpenAiTelemetryRecorder,
} from './openai-generation';

@Injectable()
export class OpenAiTelemetryService implements OpenAiTelemetryRecorder {
  private readonly logger = new Logger(OpenAiTelemetryService.name);

  constructor(private readonly prisma: PrismaService) {}

  record(entry: OpenAiCallRecord): void {
    void this.persist(entry).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`AI call telemetry could not be persisted: ${message}`);
    });
  }

  private async persist(entry: OpenAiCallRecord): Promise<void> {
    await this.prisma.aiCall.create({
      data: {
        gameId: entry.gameId,
        generationRunId: entry.generationRunId,
        stage: entry.stage,
        model: entry.model,
        status: entry.status,
        attempt: entry.attempt,
        repairMode: entry.repairMode ?? null,
        durationMs: entry.durationMs,
        payloadBytes: entry.payloadBytes,
        inputTokens: entry.inputTokens,
        cachedInputTokens: entry.cachedInputTokens,
        cacheWriteTokens: entry.cacheWriteTokens,
        reasoningTokens: entry.reasoningTokens,
        outputTokens: entry.outputTokens,
        estimatedCostMicros: estimateOpenAiCostMicros(entry),
        error: entry.error ?? null,
        createdAt: new Date(entry.timestamp),
      },
    });
  }
}
