import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  CreditLedgerEntryType,
  CreditReservationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const DEFAULT_STALE_RESERVATION_MINUTES = 30;

export class InsufficientCreditsException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'Payment Required',
        message: 'A saga credit is required to begin generation',
        code: 'INSUFFICIENT_SAGA_CREDITS',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

export type CreditAccountState = {
  enforcementEnabled: boolean;
  unlimited: boolean;
  balance: number;
  reserved: number;
  available: number | null;
};

export type CreditReservationResult = {
  bypassed: boolean;
  reason: 'unlimited' | null;
  reservation: {
    id: string;
    userId: string;
    sagaGenerationJobId: string | null;
    amount: number;
    status: CreditReservationStatus;
  } | null;
};

@Injectable()
export class CreditService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CreditService.name);
  private cleanupTimer: NodeJS.Timeout | null = null;
  private cleanupRunning = false;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    void this.cleanupStaleReservations();
    this.cleanupTimer = setInterval(
      () => void this.cleanupStaleReservations(),
      5 * 60_000,
    );
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  get enforcementEnabled(): boolean {
    return this.booleanEnvironmentValue('CREDIT_ENFORCEMENT_ENABLED');
  }

  async state(userId: string): Promise<CreditAccountState> {
    const now = new Date();
    const [user, credits, reservations] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      }),
      this.prisma.creditLedgerEntry.aggregate({
        where: {
          userId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        _sum: { amount: true },
      }),
      this.prisma.creditReservation.aggregate({
        where: { userId, status: CreditReservationStatus.ACTIVE },
        _sum: { amount: true },
      }),
    ]);
    if (!user) throw new NotFoundException('User not found');

    const balance = credits._sum.amount ?? 0;
    const reserved = reservations._sum.amount ?? 0;
    const unlimited = this.isUnlimitedEmail(user.email);
    return {
      enforcementEnabled: this.enforcementEnabled,
      unlimited,
      balance,
      reserved,
      available: unlimited ? null : balance - reserved,
    };
  }

  async reserve(
    userId: string,
    sagaGenerationJobId: string,
    amount = 1,
  ): Promise<CreditReservationResult> {
    this.assertAmount(amount);
    return this.prisma.$transaction(
      async (transaction) => {
        await this.lockUser(transaction, userId);
        const user = await transaction.user.findUnique({
          where: { id: userId },
          select: { email: true },
        });
        if (!user) throw new NotFoundException('User not found');
        if (this.isUnlimitedEmail(user.email)) {
          return { bypassed: true, reason: 'unlimited', reservation: null };
        }

        const existing = await transaction.creditReservation.findUnique({
          where: { sagaGenerationJobId },
        });
        if (existing) {
          if (existing.userId !== userId) {
            throw new ConflictException(
              'Generation job is already reserved by another user',
            );
          }
          if (existing.status !== CreditReservationStatus.RELEASED) {
            return {
              bypassed: false,
              reason: null,
              reservation: existing,
            };
          }
        }

        const available = await this.availableInTransaction(
          transaction,
          userId,
        );
        if (available < amount) throw new InsufficientCreditsException();

        const reservation = existing
          ? await transaction.creditReservation.update({
              where: { id: existing.id },
              data: {
                amount,
                status: CreditReservationStatus.ACTIVE,
                resolvedAt: null,
              },
            })
          : await transaction.creditReservation.create({
              data: { userId, sagaGenerationJobId, amount },
            });
        return {
          bypassed: false,
          reason: null,
          reservation,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async consume(reservationId: string): Promise<void> {
    await this.prisma.$transaction(
      async (transaction) => {
        const reservation = await transaction.creditReservation.findUnique({
          where: { id: reservationId },
        });
        if (!reservation) throw new NotFoundException('Reservation not found');
        await this.lockUser(transaction, reservation.userId);

        const current = await transaction.creditReservation.findUnique({
          where: { id: reservationId },
        });
        if (!current) throw new NotFoundException('Reservation not found');
        if (current.status === CreditReservationStatus.CONSUMED) return;
        if (current.status === CreditReservationStatus.RELEASED) {
          throw new ConflictException(
            'Released reservation cannot be consumed',
          );
        }

        const idempotencyKey = `generation-consumption:${current.id}`;
        await transaction.creditLedgerEntry.upsert({
          where: { idempotencyKey },
          create: {
            userId: current.userId,
            amount: -current.amount,
            type: CreditLedgerEntryType.GENERATION_CONSUMPTION,
            idempotencyKey,
            referenceId: current.sagaGenerationJobId,
            description: 'Saga generation credit',
          },
          update: {},
        });
        await transaction.creditReservation.update({
          where: { id: current.id },
          data: {
            status: CreditReservationStatus.CONSUMED,
            resolvedAt: new Date(),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async release(reservationId: string): Promise<void> {
    const reservation = await this.prisma.creditReservation.findUnique({
      where: { id: reservationId },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (reservation.status === CreditReservationStatus.RELEASED) return;
    if (reservation.status === CreditReservationStatus.CONSUMED) {
      throw new ConflictException('Consumed reservation cannot be released');
    }
    await this.prisma.creditReservation.updateMany({
      where: {
        id: reservationId,
        status: CreditReservationStatus.ACTIVE,
      },
      data: {
        status: CreditReservationStatus.RELEASED,
        resolvedAt: new Date(),
      },
    });
  }

  async releaseStaleReservations(now = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - this.staleReservationMinutes() * 60_000,
    );
    const stale = await this.prisma.creditReservation.findMany({
      where: {
        status: CreditReservationStatus.ACTIVE,
        updatedAt: { lt: cutoff },
        OR: [
          { sagaGenerationJobId: null },
          { sagaGenerationJob: { is: null } },
          {
            sagaGenerationJob: {
              is: { status: { in: ['FAILED', 'COMPLETED'] } },
            },
          },
        ],
      },
      select: { id: true },
    });
    if (!stale.length) return 0;

    const result = await this.prisma.creditReservation.updateMany({
      where: {
        id: { in: stale.map(({ id }) => id) },
        status: CreditReservationStatus.ACTIVE,
      },
      data: {
        status: CreditReservationStatus.RELEASED,
        resolvedAt: now,
      },
    });
    return result.count;
  }

  private async cleanupStaleReservations(): Promise<void> {
    if (this.cleanupRunning) return;
    this.cleanupRunning = true;
    try {
      const released = await this.releaseStaleReservations();
      if (released > 0) {
        this.logger.warn(`Released ${released} stale credit reservation(s)`);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      this.logger.error(`Credit reservation cleanup failed: ${message}`);
    } finally {
      this.cleanupRunning = false;
    }
  }

  private async availableInTransaction(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<number> {
    const now = new Date();
    const [credits, reservations] = await Promise.all([
      transaction.creditLedgerEntry.aggregate({
        where: {
          userId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        _sum: { amount: true },
      }),
      transaction.creditReservation.aggregate({
        where: { userId, status: CreditReservationStatus.ACTIVE },
        _sum: { amount: true },
      }),
    ]);
    return (credits._sum.amount ?? 0) - (reservations._sum.amount ?? 0);
  }

  private async lockUser(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`,
    );
  }

  private isUnlimitedEmail(email: string): boolean {
    return this.unlimitedEmails().has(email.trim().toLowerCase());
  }

  private unlimitedEmails(): Set<string> {
    return new Set(
      (process.env.UNLIMITED_CREDIT_EMAILS ?? '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  private booleanEnvironmentValue(name: string): boolean {
    return ['1', 'true', 'yes', 'on'].includes(
      (process.env[name] ?? '').trim().toLowerCase(),
    );
  }

  private staleReservationMinutes(): number {
    const configured = Number(process.env.CREDIT_RESERVATION_STALE_MINUTES);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_STALE_RESERVATION_MINUTES;
  }

  private assertAmount(amount: number): void {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadCreditAmountException();
    }
  }
}

class BadCreditAmountException extends HttpException {
  constructor() {
    super('Credit amount must be a positive integer', HttpStatus.BAD_REQUEST);
  }
}
