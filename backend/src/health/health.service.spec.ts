import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const prisma = { $queryRaw: jest.fn() };
  const service = new HealthService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('reports ready when the database responds', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(service.readiness()).resolves.toEqual({
      status: 'ok',
      checks: { api: 'ok', database: 'ok' },
      timestamp: expect.any(String),
    });
  });

  it('returns a generic unavailable response when the database fails', async () => {
    prisma.$queryRaw.mockRejectedValue(
      new Error('secret database hostname and credentials'),
    );

    let caught: unknown;
    try {
      await service.readiness();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableException);
    expect((caught as ServiceUnavailableException).getResponse()).toEqual({
      status: 'unavailable',
      checks: { api: 'ok', database: 'unavailable' },
      timestamp: expect.any(String),
    });
    expect(
      JSON.stringify((caught as ServiceUnavailableException).getResponse()),
    ).not.toContain('secret database hostname');
  });
});
