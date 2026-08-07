import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BillingPlan, CreditLedgerEntryType, Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../database/prisma.service';
import type { BillingProduct } from './dto/create-checkout.dto';
import { CreditService } from './credit.service';

type ProductDefinition = {
  mode: 'payment' | 'subscription';
  credits: number;
  priceId?: string;
  plan?: BillingPlan;
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  private readonly appUrl = (
    process.env.PUBLIC_APP_URL ?? 'http://localhost:4200'
  ).replace(/\/$/, '');

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditService,
  ) {
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    this.stripe = secretKey ? new Stripe(secretKey) : null;
  }

  async status(userId: string) {
    const [creditState, subscription] = await Promise.all([
      this.credits.state(userId),
      this.prisma.billingSubscription.findFirst({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    return {
      configured: this.isConfigured(),
      ...creditState,
      subscription,
    };
  }

  async createCheckout(userId: string, product: BillingProduct) {
    const stripe = this.requireStripe();
    const definition = this.definition(product);
    if (!definition.priceId) {
      throw new ServiceUnavailableException(
        `Stripe price for ${product} is not configured`,
      );
    }

    if (definition.mode === 'subscription') {
      const active = await this.prisma.billingSubscription.findFirst({
        where: { userId, status: { in: ['active', 'trialing', 'past_due'] } },
      });
      if (active) {
        throw new BadRequestException(
          'Manage your current subscription in the billing portal',
        );
      }
    }

    const customerId = await this.getOrCreateCustomer(userId);
    const metadata = { userId, product };
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: definition.mode,
      line_items: [{ price: definition.priceId, quantity: 1 }],
      metadata,
      payment_intent_data:
        definition.mode === 'payment' ? { metadata } : undefined,
      subscription_data:
        definition.mode === 'subscription' ? { metadata } : undefined,
      success_url: `${this.appUrl}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.appUrl}/?billing=cancelled`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      throw new ServiceUnavailableException(
        'Stripe did not create a checkout URL',
      );
    }
    return { url: session.url };
  }

  async createPortal(userId: string) {
    const stripe = this.requireStripe();
    const customer = await this.getOrCreateCustomer(userId);
    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url: `${this.appUrl}/`,
    });
    return { url: session.url };
  }

  async handleWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<{ received: true; duplicate?: true }> {
    const stripe = this.requireStripe();
    if (!this.webhookSecret) {
      throw new ServiceUnavailableException(
        'Stripe webhook secret is not configured',
      );
    }
    if (!rawBody || !signature) {
      throw new BadRequestException(
        'Missing Stripe signature or raw request body',
      );
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    const existing = await this.prisma.stripeEvent.findUnique({
      where: { id: event.id },
    });
    if (existing?.processedAt) return { received: true, duplicate: true };

    await this.prisma.stripeEvent.upsert({
      where: { id: event.id },
      create: {
        id: event.id,
        type: event.type,
        objectId: this.eventObjectId(event),
        livemode: event.livemode,
        apiVersion: event.api_version ?? null,
        payload: JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue,
      },
      update: {
        type: event.type,
        objectId: this.eventObjectId(event),
        processingError: null,
      },
    });

    try {
      await this.processEvent(event);
      await this.prisma.stripeEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date(), processingError: null },
      });
      return { received: true };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      await this.prisma.stripeEvent.update({
        where: { id: event.id },
        data: { processingError: message },
      });
      this.logger.error(`Stripe event ${event.id} failed: ${message}`);
      throw caught;
    }
  }

  private async processEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await this.fulfillCheckout(event.data.object, event.id);
        break;
      case 'invoice.paid':
        await this.fulfillSubscriptionInvoice(event.data.object, event.id);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.syncSubscription(event.data.object);
        break;
      case 'charge.refunded':
        await this.recordFullRefund(event.data.object, event.id);
        break;
      default:
        break;
    }
  }

  private async fulfillCheckout(
    session: Stripe.Checkout.Session,
    eventId: string,
  ): Promise<void> {
    if (session.mode !== 'payment' || session.payment_status !== 'paid') return;
    const userId = session.metadata?.userId;
    const product = this.parseProduct(session.metadata?.product);
    const definition = product ? this.definition(product) : null;
    if (!userId || !product || !definition || definition.mode !== 'payment') {
      throw new Error(`Checkout session ${session.id} has invalid metadata`);
    }

    await this.prisma.creditLedgerEntry.upsert({
      where: { idempotencyKey: `stripe:checkout:${session.id}:credits` },
      create: {
        userId,
        amount: definition.credits,
        type: CreditLedgerEntryType.ONE_TIME_PURCHASE,
        idempotencyKey: `stripe:checkout:${session.id}:credits`,
        stripeEventId: eventId,
        referenceId: session.id,
        description: `${definition.credits} saga credit purchase`,
      },
      update: {},
    });
  }

  private async fulfillSubscriptionInvoice(
    invoice: Stripe.Invoice,
    eventId: string,
  ): Promise<void> {
    if (
      !['subscription_create', 'subscription_cycle'].includes(
        invoice.billing_reason ?? '',
      )
    ) {
      return;
    }
    const customerId = this.idOf(invoice.customer);
    if (!customerId) throw new Error(`Invoice ${invoice.id} has no customer`);
    const user = await this.prisma.user.findUnique({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });
    if (!user) throw new Error(`No user owns Stripe customer ${customerId}`);

    const priceId = invoice.lines.data
      .map((line) => line.pricing?.price_details?.price)
      .map((price) => this.idOf(price))
      .find((id): id is string => Boolean(id));
    const match = priceId ? this.subscriptionDefinitionByPrice(priceId) : null;
    if (!match)
      throw new Error(
        `Invoice ${invoice.id} uses an unknown subscription price`,
      );

    await this.prisma.creditLedgerEntry.upsert({
      where: { idempotencyKey: `stripe:invoice:${invoice.id}:credits` },
      create: {
        userId: user.id,
        amount: match.definition.credits,
        type: CreditLedgerEntryType.SUBSCRIPTION_GRANT,
        idempotencyKey: `stripe:invoice:${invoice.id}:credits`,
        stripeEventId: eventId,
        referenceId: invoice.id,
        description: `${match.product} monthly saga credits`,
      },
      update: {},
    });
  }

  private async syncSubscription(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const item = subscription.items.data[0];
    const priceId = item?.price.id;
    const match = priceId ? this.subscriptionDefinitionByPrice(priceId) : null;
    if (!item || !match?.definition.plan) {
      throw new Error(`Subscription ${subscription.id} uses an unknown price`);
    }

    const customerId = this.idOf(subscription.customer);
    const metadataUserId = subscription.metadata.userId;
    const user = metadataUserId
      ? await this.prisma.user.findUnique({ where: { id: metadataUserId } })
      : customerId
        ? await this.prisma.user.findUnique({
            where: { stripeCustomerId: customerId },
          })
        : null;
    if (!user) throw new Error(`No user owns subscription ${subscription.id}`);

    await this.prisma.billingSubscription.upsert({
      where: { id: subscription.id },
      create: {
        id: subscription.id,
        userId: user.id,
        plan: match.definition.plan,
        priceId,
        status: subscription.status,
        currentPeriodStart: new Date(item.current_period_start * 1000),
        currentPeriodEnd: new Date(item.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
      update: {
        plan: match.definition.plan,
        priceId,
        status: subscription.status,
        currentPeriodStart: new Date(item.current_period_start * 1000),
        currentPeriodEnd: new Date(item.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
    });
  }

  private async recordFullRefund(
    charge: Stripe.Charge,
    eventId: string,
  ): Promise<void> {
    if (charge.amount_refunded < charge.amount) return;
    const stripe = this.requireStripe();
    const paymentIntentId = this.idOf(charge.payment_intent);
    if (!paymentIntentId) return;
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const userId = intent.metadata.userId;
    const product = this.parseProduct(intent.metadata.product);
    const definition = product ? this.definition(product) : null;
    if (!userId || !definition || definition.mode !== 'payment') return;

    await this.prisma.creditLedgerEntry.upsert({
      where: { idempotencyKey: `stripe:charge:${charge.id}:full-refund` },
      create: {
        userId,
        amount: -definition.credits,
        type: CreditLedgerEntryType.PURCHASE_REFUND,
        idempotencyKey: `stripe:charge:${charge.id}:full-refund`,
        stripeEventId: eventId,
        referenceId: charge.id,
        description: `Refunded ${definition.credits} saga credit purchase`,
      },
      update: {},
    });
  }

  private async getOrCreateCustomer(userId: string): Promise<string> {
    const stripe = this.requireStripe();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.stripeCustomerId) return user.stripeCustomerId;

    const customer = await stripe.customers.create({
      email: user.email,
      name: user.displayName,
      metadata: { userId },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customer.id },
    });
    return customer.id;
  }

  private definition(product: BillingProduct): ProductDefinition {
    const products: Record<BillingProduct, ProductDefinition> = {
      single_saga: {
        mode: 'payment',
        credits: 1,
        priceId: process.env.STRIPE_PRICE_SINGLE_SAGA?.trim(),
      },
      five_sagas: {
        mode: 'payment',
        credits: 5,
        priceId: process.env.STRIPE_PRICE_FIVE_SAGAS?.trim(),
      },
      scribe: {
        mode: 'subscription',
        credits: 4,
        priceId: process.env.STRIPE_PRICE_SCRIBE?.trim(),
        plan: BillingPlan.SCRIBE,
      },
      chronicler: {
        mode: 'subscription',
        credits: 9,
        priceId: process.env.STRIPE_PRICE_CHRONICLER?.trim(),
        plan: BillingPlan.CHRONICLER,
      },
      realm_founder: {
        mode: 'subscription',
        credits: 20,
        priceId: process.env.STRIPE_PRICE_REALM_FOUNDER?.trim(),
        plan: BillingPlan.REALM_FOUNDER,
      },
    };
    return products[product];
  }

  private subscriptionDefinitionByPrice(priceId: string): {
    product: BillingProduct;
    definition: ProductDefinition;
  } | null {
    for (const product of ['scribe', 'chronicler', 'realm_founder'] as const) {
      const definition = this.definition(product);
      if (definition.priceId === priceId) return { product, definition };
    }
    return null;
  }

  private parseProduct(value: string | undefined): BillingProduct | null {
    if (
      value === 'single_saga' ||
      value === 'five_sagas' ||
      value === 'scribe' ||
      value === 'chronicler' ||
      value === 'realm_founder'
    ) {
      return value;
    }
    return null;
  }

  private isConfigured(): boolean {
    return Boolean(this.stripe && this.webhookSecret);
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe billing is not configured');
    }
    return this.stripe;
  }

  private idOf(
    value: string | { id: string } | null | undefined,
  ): string | null {
    if (!value) return null;
    return typeof value === 'string' ? value : value.id;
  }

  private eventObjectId(event: Stripe.Event): string | null {
    const object = event.data.object as { id?: string };
    return object.id ?? null;
  }
}
