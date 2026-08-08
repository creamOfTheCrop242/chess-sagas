import { OpenAiTelemetryService } from './openai-telemetry.service';

describe('OpenAiTelemetryService', () => {
  it('persists a priced AI call without exposing persistence to the caller', async () => {
    let persisted: { data: Record<string, unknown> } | undefined;
    const prisma = {
      aiCall: {
        create: (args: { data: Record<string, unknown> }) => {
          persisted = args;
          return Promise.resolve({});
        },
      },
    };
    const service = new OpenAiTelemetryService(prisma as never);
    service.record({
      timestamp: '2026-08-08T12:00:00.000Z',
      gameId: 'game-1',
      generationRunId: 'run-1',
      stage: 'full-story',
      model: 'gpt-5.6-terra',
      status: 'SUCCEEDED',
      attempt: 1,
      repairMode: 'none',
      durationMs: 1000,
      payloadBytes: 500,
      inputTokens: 1000,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 20,
      outputTokens: 100,
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(persisted).toBeDefined();
    if (!persisted) throw new Error('Expected telemetry persistence call');
    expect(persisted.data).toMatchObject({
      gameId: 'game-1',
      generationRunId: 'run-1',
      estimatedCostMicros: 4000,
      status: 'SUCCEEDED',
    });
  });
});
