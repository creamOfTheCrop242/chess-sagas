import { BillingService } from './billing.service';

describe('BillingService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    creditLedgerEntry: {
      aggregate: jest.fn(),
      upsert: jest.fn(),
    },
    creditReservation: { aggregate: jest.fn() },
    billingSubscription: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    stripeEvent: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  };
  const originalEnvironment = { ...process.env };
  const credits = {
    state: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_example';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example';
    process.env.STRIPE_PRICE_SINGLE_SAGA = 'price_single';
    process.env.STRIPE_PRICE_FIVE_SAGAS = 'price_five';
    process.env.STRIPE_PRICE_SCRIBE = 'price_scribe';
    process.env.STRIPE_PRICE_CHRONICLER = 'price_chronicler';
    process.env.STRIPE_PRICE_REALM_FOUNDER = 'price_founder';
    process.env.PUBLIC_APP_URL = 'https://chesssagas.com/';
    credits.state.mockResolvedValue({
      enforcementEnabled: false,
      unlimited: false,
      balance: 7,
      reserved: 2,
      available: 5,
    });
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('reports ledger balance separately from active reservations', async () => {
    prisma.billingSubscription.findFirst.mockResolvedValue(null);
    const service = new BillingService(prisma as never, credits as never);

    await expect(service.status('user-1')).resolves.toMatchObject({
      configured: true,
      enforcementEnabled: false,
      unlimited: false,
      balance: 7,
      reserved: 2,
      available: 5,
      subscription: null,
    });
  });

  it('creates one-time checkout from the server-owned product map', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'reader@example.com',
      displayName: 'Saga Reader',
      stripeCustomerId: 'cus_123',
    });
    const create = jest.fn().mockResolvedValue({
      id: 'cs_123',
      url: 'https://checkout.stripe.com/session',
    });
    const service = new BillingService(prisma as never, credits as never);
    Object.defineProperty(service, 'stripe', {
      value: { checkout: { sessions: { create } } },
    });

    await expect(
      service.createCheckout('user-1', 'single_saga'),
    ).resolves.toEqual({ url: 'https://checkout.stripe.com/session' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
        mode: 'payment',
        line_items: [{ price: 'price_single', quantity: 1 }],
        metadata: { userId: 'user-1', product: 'single_saga' },
      }),
    );
  });

  it('does not process a completed webhook event twice', async () => {
    prisma.stripeEvent.findUnique.mockResolvedValue({
      id: 'evt_123',
      processedAt: new Date(),
    });
    const event = {
      id: 'evt_123',
      type: 'checkout.session.completed',
      livemode: false,
      data: { object: { id: 'cs_123' } },
    };
    const service = new BillingService(prisma as never, credits as never);
    Object.defineProperty(service, 'stripe', {
      value: {
        webhooks: { constructEvent: jest.fn().mockReturnValue(event) },
      },
    });

    await expect(
      service.handleWebhook(Buffer.from('{}'), 'signature'),
    ).resolves.toEqual({ received: true, duplicate: true });
    expect(prisma.stripeEvent.upsert).not.toHaveBeenCalled();
    expect(prisma.creditLedgerEntry.upsert).not.toHaveBeenCalled();
  });

  it('grants a subscription invoice exactly once through its idempotency key', async () => {
    prisma.stripeEvent.findUnique.mockResolvedValue(null);
    prisma.stripeEvent.upsert.mockResolvedValue({});
    prisma.stripeEvent.update.mockResolvedValue({});
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.creditLedgerEntry.upsert.mockResolvedValue({});
    const event = {
      id: 'evt_invoice',
      type: 'invoice.paid',
      livemode: false,
      api_version: '2026-06-30',
      data: {
        object: {
          id: 'in_123',
          customer: 'cus_123',
          billing_reason: 'subscription_cycle',
          lines: {
            data: [
              { pricing: { price_details: { price: 'price_chronicler' } } },
            ],
          },
        },
      },
    };
    const service = new BillingService(prisma as never, credits as never);
    Object.defineProperty(service, 'stripe', {
      value: {
        webhooks: { constructEvent: jest.fn().mockReturnValue(event) },
      },
    });

    await service.handleWebhook(Buffer.from('{}'), 'signature');

    expect(prisma.creditLedgerEntry.upsert).toHaveBeenCalledWith({
      where: { idempotencyKey: 'stripe:invoice:in_123:credits' },
      // Jest's asymmetric matcher is intentionally untyped at runtime.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      create: expect.objectContaining({
        userId: 'user-1',
        amount: 9,
        idempotencyKey: 'stripe:invoice:in_123:credits',
      }),
      update: {},
    });
  });
});
