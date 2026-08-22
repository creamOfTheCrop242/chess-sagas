import { ForbiddenException } from '@nestjs/common';
import { ReportingService } from './reporting.service';

describe('ReportingService', () => {
  const config = {
    get: jest.fn((name: string) =>
      name === 'REPORTING_ADMIN_EMAILS'
        ? 'owner@example.com, second@example.com'
        : undefined,
    ),
  };

  it('restricts reports to explicitly configured administrators', () => {
    const service = new ReportingService({} as never, config as never);
    expect(() => service.assertAdmin('OWNER@example.com')).not.toThrow();
    expect(service.isAdmin('second@example.com')).toBe(true);
    expect(service.isAdmin('reader@example.com')).toBe(false);
    expect(() => service.assertAdmin('reader@example.com')).toThrow(
      ForbiddenException,
    );
  });

  it('separates unlimited AI expense from customer gross margin', async () => {
    const prisma = {
      aiCall: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            aiCall('CONSUMED', 'customer@example.com', 30_000),
            aiCall('UNLIMITED', 'owner@example.com', 70_000),
          ]),
      },
      generationRun: { findMany: jest.fn().mockResolvedValue([]) },
      sagaGenerationJob: { findMany: jest.fn().mockResolvedValue([]) },
      creditLedgerEntry: { findMany: jest.fn().mockResolvedValue([]) },
      stripeEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ReportingService(prisma as never, config as never);
    const report = await service.overview({
      from: new Date('2026-08-01T00:00:00Z'),
      to: new Date('2026-08-09T00:00:00Z'),
    });

    expect(report.ai.total.estimatedCostMicros).toBe(100_000);
    expect(report.ai.customer.estimatedCostMicros).toBe(30_000);
    expect(report.ai.unlimited.estimatedCostMicros).toBe(70_000);
    expect(report.ai.unlimitedAccounts[0]?.email).toBe('owner@example.com');
    expect(report.ai.unlimitedAccounts[0]?.estimatedCostMicros).toBe(70_000);
    expect(report.summary.estimatedGrossMarginCents).toBe(-3);
  });

  it('reports active completed-pipeline time instead of total job age', async () => {
    const prisma = {
      aiCall: { findMany: jest.fn().mockResolvedValue([]) },
      generationRun: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            generationRun('game-1', 60),
            generationRun('game-1', 90),
            generationRun('game-2', 30),
          ]),
      },
      sagaGenerationJob: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            generationJob('game-1', 'COMPLETED', 'CONSUMED'),
            generationJob('game-2', 'FAILED', 'RELEASED'),
            generationJob('game-3', 'COMPLETED', 'REUSED'),
          ]),
      },
      creditLedgerEntry: { findMany: jest.fn().mockResolvedValue([]) },
      stripeEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ReportingService(prisma as never, config as never);

    const report = await service.overview({
      from: new Date('2026-08-01T00:00:00Z'),
      to: new Date('2026-08-09T00:00:00Z'),
    });

    expect(report.summary.averageGenerationSeconds).toBe(150);
    expect(report.generation.averageSeconds).toBe(150);
  });

  it('reports average AI cost per completed saga including retry expense', async () => {
    const prisma = {
      aiCall: {
        findMany: jest.fn().mockResolvedValue([
          aiCall('CONSUMED', 'customer@example.com', 30_000),
          aiCall('CONSUMED', 'customer@example.com', 20_000),
        ]),
      },
      generationRun: { findMany: jest.fn().mockResolvedValue([]) },
      sagaGenerationJob: {
        findMany: jest.fn().mockResolvedValue([
          generationJob('game-1', 'COMPLETED', 'CONSUMED'),
          generationJob('game-2', 'COMPLETED', 'CONSUMED'),
        ]),
      },
      creditLedgerEntry: { findMany: jest.fn().mockResolvedValue([]) },
      stripeEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ReportingService(prisma as never, config as never);

    const report = await service.overview({
      from: new Date('2026-08-01T00:00:00Z'),
      to: new Date('2026-08-09T00:00:00Z'),
    });

    expect(report.summary.averageAiCostPerCompletedSagaUsd).toBe(0.025);
  });
});

function generationRun(gameId: string, seconds: number) {
  const createdAt = new Date('2026-08-01T00:00:00Z');
  return {
    gameId,
    currentStage: 'STORY',
    status: 'COMPLETED',
    error: null,
    createdAt,
    completedAt: new Date(createdAt.getTime() + seconds * 1000),
  };
}

function generationJob(
  gameId: string,
  status: 'COMPLETED' | 'FAILED',
  billingState: 'CONSUMED' | 'RELEASED' | 'REUSED',
) {
  return {
    id: `job-${gameId}`,
    gameId,
    status,
    billingState,
    error: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    completedAt: new Date('2026-08-01T01:00:00Z'),
    requestedBy: null,
  };
}

function aiCall(
  billingState: 'CONSUMED' | 'UNLIMITED',
  email: string,
  estimatedCostMicros: number,
) {
  return {
    stage: 'full-story',
    model: 'gpt-5.6-terra',
    status: 'SUCCEEDED',
    attempt: 1,
    repairMode: 'none',
    durationMs: 1000,
    inputTokens: 100,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    outputTokens: 100,
    estimatedCostMicros,
    error: null,
    game: {
      sagaJob: {
        billingState,
        requestedBy: { email },
      },
    },
  };
}
