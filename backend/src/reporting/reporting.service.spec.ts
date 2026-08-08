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
});

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
