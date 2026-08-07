import { CreditReservationStatus, Prisma } from '@prisma/client';
import { CreditService, InsufficientCreditsException } from './credit.service';

describe('CreditService', () => {
  const transaction = {
    $queryRaw: jest.fn(),
    user: { findUnique: jest.fn() },
    creditLedgerEntry: {
      aggregate: jest.fn(),
      upsert: jest.fn(),
    },
    creditReservation: {
      aggregate: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
    user: { findUnique: jest.fn() },
    creditLedgerEntry: { aggregate: jest.fn() },
    creditReservation: {
      aggregate: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CREDIT_ENFORCEMENT_ENABLED;
    delete process.env.UNLIMITED_CREDIT_EMAILS;
    delete process.env.CREDIT_RESERVATION_STALE_MINUTES;
    transaction.$queryRaw.mockResolvedValue([{ id: 'user-1' }]);
    transaction.user.findUnique.mockResolvedValue({
      email: 'reader@example.com',
    });
    transaction.creditLedgerEntry.aggregate.mockResolvedValue({
      _sum: { amount: 1 },
    });
    transaction.creditReservation.aggregate.mockResolvedValue({
      _sum: { amount: 0 },
    });
    transaction.creditReservation.findUnique.mockResolvedValue(null);
    transaction.creditReservation.create.mockResolvedValue({
      id: 'reservation-1',
      userId: 'user-1',
      sagaGenerationJobId: 'job-1',
      amount: 1,
      status: CreditReservationStatus.ACTIVE,
    });
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('reports unlimited accounts separately from their numeric ledger', async () => {
    process.env.CREDIT_ENFORCEMENT_ENABLED = 'true';
    process.env.UNLIMITED_CREDIT_EMAILS =
      'another@example.com, DHUDSON0242@GMAIL.COM ';
    prisma.user.findUnique.mockResolvedValue({
      email: 'dhudson0242@gmail.com',
    });
    prisma.creditLedgerEntry.aggregate.mockResolvedValue({
      _sum: { amount: 3 },
    });
    prisma.creditReservation.aggregate.mockResolvedValue({
      _sum: { amount: 1 },
    });
    const service = new CreditService(prisma as never);

    await expect(service.state('user-1')).resolves.toEqual({
      enforcementEnabled: true,
      unlimited: true,
      balance: 3,
      reserved: 1,
      available: null,
    });
  });

  it('bypasses reservations for an unlimited verified account', async () => {
    process.env.UNLIMITED_CREDIT_EMAILS = 'dhudson0242@gmail.com';
    transaction.user.findUnique.mockResolvedValue({
      email: 'DHUDSON0242@gmail.com',
    });
    const service = new CreditService(prisma as never);

    await expect(service.reserve('user-1', 'job-1')).resolves.toEqual({
      bypassed: true,
      reason: 'unlimited',
      reservation: null,
    });
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.creditReservation.create).not.toHaveBeenCalled();
    expect(transaction.creditLedgerEntry.aggregate).not.toHaveBeenCalled();
  });

  it('creates one reservation while holding a per-user database lock', async () => {
    const service = new CreditService(prisma as never);

    await expect(service.reserve('user-1', 'job-1')).resolves.toMatchObject({
      bypassed: false,
      reservation: { id: 'reservation-1', status: 'ACTIVE' },
    });
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.creditReservation.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        sagaGenerationJobId: 'job-1',
        amount: 1,
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('returns the existing active reservation without charging twice', async () => {
    transaction.creditReservation.findUnique.mockResolvedValue({
      id: 'reservation-1',
      userId: 'user-1',
      sagaGenerationJobId: 'job-1',
      amount: 1,
      status: CreditReservationStatus.ACTIVE,
    });
    const service = new CreditService(prisma as never);

    await service.reserve('user-1', 'job-1');
    await service.reserve('user-1', 'job-1');

    expect(transaction.creditReservation.create).not.toHaveBeenCalled();
    expect(transaction.creditLedgerEntry.aggregate).not.toHaveBeenCalled();
  });

  it('rejects a reservation when no unreserved credit remains', async () => {
    transaction.creditLedgerEntry.aggregate.mockResolvedValue({
      _sum: { amount: 1 },
    });
    transaction.creditReservation.aggregate.mockResolvedValue({
      _sum: { amount: 1 },
    });
    const service = new CreditService(prisma as never);

    await expect(service.reserve('user-1', 'job-1')).rejects.toBeInstanceOf(
      InsufficientCreditsException,
    );
    expect(transaction.creditReservation.create).not.toHaveBeenCalled();
  });

  it('consumes an active reservation exactly once', async () => {
    let status = CreditReservationStatus.ACTIVE;
    transaction.creditReservation.findUnique.mockImplementation(() =>
      Promise.resolve({
        id: 'reservation-1',
        userId: 'user-1',
        sagaGenerationJobId: 'job-1',
        amount: 1,
        status,
      }),
    );
    transaction.creditLedgerEntry.upsert.mockResolvedValue({});
    transaction.creditReservation.update.mockImplementation(() => {
      status = CreditReservationStatus.CONSUMED;
      return Promise.resolve({});
    });
    const service = new CreditService(prisma as never);

    await service.consume('reservation-1');
    await service.consume('reservation-1');

    expect(transaction.creditLedgerEntry.upsert).toHaveBeenCalledTimes(1);
    expect(transaction.creditLedgerEntry.upsert).toHaveBeenCalledWith({
      where: {
        idempotencyKey: 'generation-consumption:reservation-1',
      },
      // Jest's asymmetric matcher is intentionally untyped at runtime.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      create: expect.objectContaining({
        userId: 'user-1',
        amount: -1,
        idempotencyKey: 'generation-consumption:reservation-1',
      }),
      update: {},
    });
    expect(transaction.creditReservation.update).toHaveBeenCalledTimes(1);
  });

  it('consumes a reservation by generation job id', async () => {
    prisma.creditReservation.findUnique.mockResolvedValue({
      id: 'reservation-1',
    });
    transaction.creditReservation.findUnique.mockResolvedValue({
      id: 'reservation-1',
      userId: 'user-1',
      sagaGenerationJobId: 'job-1',
      amount: 1,
      status: CreditReservationStatus.ACTIVE,
    });
    transaction.creditLedgerEntry.upsert.mockResolvedValue({});
    transaction.creditReservation.update.mockResolvedValue({});
    const service = new CreditService(prisma as never);

    await expect(service.consumeForJob('job-1')).resolves.toBe(true);
    expect(prisma.creditReservation.findUnique).toHaveBeenCalledWith({
      where: { sagaGenerationJobId: 'job-1' },
      select: { id: true },
    });
    expect(transaction.creditLedgerEntry.upsert).toHaveBeenCalledTimes(1);
  });

  it('releases a reservation by generation job id', async () => {
    prisma.creditReservation.findUnique
      .mockResolvedValueOnce({ id: 'reservation-1' })
      .mockResolvedValueOnce({
        id: 'reservation-1',
        status: CreditReservationStatus.ACTIVE,
      });
    prisma.creditReservation.updateMany.mockResolvedValue({ count: 1 });
    const service = new CreditService(prisma as never);

    await expect(service.releaseForJob('job-1')).resolves.toBe(true);
    expect(prisma.creditReservation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'reservation-1',
        status: CreditReservationStatus.ACTIVE,
      },
      data: {
        status: CreditReservationStatus.RELEASED,
        resolvedAt: expect.any(Date),
      },
    });
  });

  it('releases only old terminal or orphaned reservations during cleanup', async () => {
    process.env.CREDIT_RESERVATION_STALE_MINUTES = '45';
    prisma.creditReservation.findMany.mockResolvedValue([
      { id: 'reservation-1' },
      { id: 'reservation-2' },
    ]);
    prisma.creditReservation.updateMany.mockResolvedValue({ count: 2 });
    const service = new CreditService(prisma as never);
    const now = new Date('2026-08-07T12:00:00.000Z');

    await expect(service.releaseStaleReservations(now)).resolves.toBe(2);
    expect(prisma.creditReservation.findMany).toHaveBeenCalledWith({
      // Jest's asymmetric matchers are intentionally untyped at runtime.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      where: expect.objectContaining({
        status: CreditReservationStatus.ACTIVE,
        updatedAt: { lt: new Date('2026-08-07T11:15:00.000Z') },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        OR: expect.arrayContaining([
          {
            sagaGenerationJob: {
              is: { status: { in: ['FAILED', 'COMPLETED'] } },
            },
          },
        ]),
      }),
      select: { id: true },
    });
    expect(prisma.creditReservation.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['reservation-1', 'reservation-2'] },
        status: CreditReservationStatus.ACTIVE,
      },
      data: {
        status: CreditReservationStatus.RELEASED,
        resolvedAt: now,
      },
    });
  });
});
