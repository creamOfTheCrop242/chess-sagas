import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AiCallStatus,
  GenerationBillingState,
  GenerationStage,
  GenerationStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type DateRange = { from: Date; to: Date };

@Injectable()
export class ReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  assertAdmin(email: string): void {
    if (!this.isAdmin(email)) {
      throw new ForbiddenException('Reporting access is restricted');
    }
  }

  isAdmin(email: string): boolean {
    return this.emailList('REPORTING_ADMIN_EMAILS').has(
      email.trim().toLowerCase(),
    );
  }

  async overview(range: DateRange) {
    const createdAt = { gte: range.from, lte: range.to };
    const [calls, runs, jobs, creditEntries, stripeEvents] = await Promise.all([
      this.prisma.aiCall.findMany({
        where: { createdAt },
        orderBy: { createdAt: 'asc' },
        include: {
          game: {
            select: {
              sagaJob: {
                select: {
                  billingState: true,
                  requestedBy: { select: { email: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.generationRun.findMany({
        where: {
          createdAt,
          status: { in: ['COMPLETED', 'FAILED'] },
        },
        select: {
          gameId: true,
          currentStage: true,
          status: true,
          error: true,
          createdAt: true,
          completedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.sagaGenerationJob.findMany({
        where: { createdAt },
        select: {
          id: true,
          gameId: true,
          status: true,
          billingState: true,
          error: true,
          createdAt: true,
          completedAt: true,
          requestedBy: { select: { email: true } },
        },
      }),
      this.prisma.creditLedgerEntry.findMany({
        where: { createdAt },
        select: { amount: true, type: true },
      }),
      this.prisma.stripeEvent.findMany({
        where: { receivedAt: createdAt, processedAt: { not: null } },
        select: { type: true, objectId: true, payload: true },
      }),
    ]);

    const ai = aggregateAiCalls(calls);
    const pipeline = aggregatePipeline(runs);
    const generation = aggregateJobs(jobs, runs);
    const billing = aggregateBilling(creditEntries, stripeEvents);
    const errors = aggregateErrors(calls, runs, jobs);

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      summary: {
        completedSagas: generation.completed,
        failedSagas: generation.failed,
        sagaFailureRate: ratio(generation.failed, generation.total),
        averageGenerationSeconds: generation.averageSeconds,
        aiCalls: ai.total.calls,
        aiCallFailures: ai.total.failed,
        aiFailureRate: ratio(ai.total.failed, ai.total.calls),
        retryCalls: ai.total.retryCalls,
        estimatedAiCostMicros: ai.total.estimatedCostMicros,
        estimatedAiCostUsd: microsToUsd(ai.total.estimatedCostMicros),
        averageAiCostPerCompletedSagaUsd: generation.completed
          ? microsToUsd(ai.total.estimatedCostMicros) / generation.completed
          : 0,
        netRevenueCents: billing.netRevenueCents,
        estimatedGrossMarginCents:
          billing.netRevenueCents -
          Math.round(ai.customer.estimatedCostMicros / 10_000),
      },
      generation,
      pipeline,
      ai,
      billing,
      errors,
    };
  }

  private emailList(name: string): Set<string> {
    return new Set(
      (this.config.get<string>(name) ?? '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    );
  }
}

type AiRow = {
  stage: string;
  model: string;
  status: AiCallStatus;
  attempt: number;
  repairMode: string | null;
  durationMs: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  outputTokens: number;
  estimatedCostMicros: number;
  error: string | null;
  game: {
    sagaJob: {
      billingState: GenerationBillingState;
      requestedBy: { email: string } | null;
    } | null;
  };
};

function aggregateAiCalls(calls: AiRow[]) {
  const groups = new Map<string, ReturnType<typeof emptyAiGroup>>();
  const attribution = new Map<string, ReturnType<typeof emptyAiGroup>>();
  const unlimitedAccounts = new Map<string, ReturnType<typeof emptyAiGroup>>();
  for (const call of calls) {
    addAiCall(groups, `${call.stage}|${call.model}`, call, {
      stage: call.stage,
      model: call.model,
    });
    const category = attributionCategory(call.game.sagaJob?.billingState);
    addAiCall(attribution, category, call, { category });
    if (category === 'unlimited') {
      const email = call.game.sagaJob?.requestedBy?.email ?? 'unknown';
      addAiCall(unlimitedAccounts, email, call, { email });
    }
  }
  const byAttribution = Object.fromEntries(attribution);
  return {
    total: summarizeAiGroup(calls.reduce(addAiRow, emptyAiGroup())),
    customer: summarizeAiGroup(attribution.get('customer') ?? emptyAiGroup()),
    unlimited: summarizeAiGroup(attribution.get('unlimited') ?? emptyAiGroup()),
    anonymous: summarizeAiGroup(attribution.get('anonymous') ?? emptyAiGroup()),
    reused: summarizeAiGroup(attribution.get('reused') ?? emptyAiGroup()),
    byStageModel: [...groups.values()].map(summarizeAiGroup),
    unlimitedAccounts: [...unlimitedAccounts.values()].map(summarizeAiGroup),
    byAttribution: Object.fromEntries(
      Object.entries(byAttribution).map(([key, value]) => [
        key,
        summarizeAiGroup(value),
      ]),
    ),
  };
}

function emptyAiGroup(extra: Record<string, string> = {}) {
  return {
    ...extra,
    calls: 0,
    succeeded: 0,
    failed: 0,
    retryCalls: 0,
    durationMs: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    outputTokens: 0,
    estimatedCostMicros: 0,
  };
}

function addAiRow<T extends ReturnType<typeof emptyAiGroup>>(
  group: T,
  call: AiRow,
): T {
  group.calls += 1;
  group[call.status === 'SUCCEEDED' ? 'succeeded' : 'failed'] += 1;
  group.retryCalls +=
    call.attempt > 1 || (call.repairMode && call.repairMode !== 'none') ? 1 : 0;
  group.durationMs += call.durationMs;
  group.inputTokens += call.inputTokens;
  group.cachedInputTokens += call.cachedInputTokens;
  group.cacheWriteTokens += call.cacheWriteTokens;
  group.reasoningTokens += call.reasoningTokens;
  group.outputTokens += call.outputTokens;
  group.estimatedCostMicros += call.estimatedCostMicros;
  return group;
}

function addAiCall(
  groups: Map<string, ReturnType<typeof emptyAiGroup>>,
  key: string,
  call: AiRow,
  extra: Record<string, string>,
): void {
  groups.set(key, addAiRow(groups.get(key) ?? emptyAiGroup(extra), call));
}

function summarizeAiGroup<T extends ReturnType<typeof emptyAiGroup>>(group: T) {
  return {
    ...group,
    failureRate: ratio(group.failed, group.calls),
    averageSeconds: group.calls ? group.durationMs / group.calls / 1000 : 0,
    estimatedCostUsd: microsToUsd(group.estimatedCostMicros),
  };
}

function attributionCategory(state?: GenerationBillingState): string {
  if (state === 'UNLIMITED' || state === 'SHADOW_UNLIMITED') return 'unlimited';
  if (state === 'SHADOW_ANONYMOUS' || !state) return 'anonymous';
  if (state === 'REUSED') return 'reused';
  return 'customer';
}

type RunRow = {
  gameId: string;
  currentStage: GenerationStage;
  status: GenerationStatus;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

function aggregatePipeline(runs: RunRow[]) {
  const stageGroups = new Map<
    GenerationStage,
    {
      stage: GenerationStage;
      attempts: number;
      completed: number;
      failed: number;
      durationMs: number;
      gameAttempts: Map<string, GenerationStatus[]>;
    }
  >();
  for (const run of runs) {
    const group = stageGroups.get(run.currentStage) ?? {
      stage: run.currentStage,
      attempts: 0,
      completed: 0,
      failed: 0,
      durationMs: 0,
      gameAttempts: new Map<string, GenerationStatus[]>(),
    };
    group.attempts += 1;
    group[run.status === 'COMPLETED' ? 'completed' : 'failed'] += 1;
    group.durationMs += elapsedMs(run.createdAt, run.completedAt);
    const attempts = group.gameAttempts.get(run.gameId) ?? [];
    attempts.push(run.status);
    group.gameAttempts.set(run.gameId, attempts);
    stageGroups.set(run.currentStage, group);
  }
  return [...stageGroups.values()].map((group) => {
    const attemptSets = [...group.gameAttempts.values()];
    return {
      stage: group.stage,
      attempts: group.attempts,
      completed: group.completed,
      failed: group.failed,
      failureRate: ratio(group.failed, group.attempts),
      averageAttemptSeconds: group.attempts
        ? group.durationMs / group.attempts / 1000
        : 0,
      firstPassCompleted: attemptSets.filter(
        (attempts) => attempts[0] === 'COMPLETED',
      ).length,
      recoveredAfterRetry: attemptSets.filter(
        (attempts) =>
          attempts[0] === 'FAILED' && attempts.includes('COMPLETED'),
      ).length,
      exhausted: attemptSets.filter(
        (attempts) => !attempts.includes('COMPLETED'),
      ).length,
    };
  });
}

type JobRow = {
  gameId: string;
  status: GenerationStatus;
  billingState: GenerationBillingState;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
  requestedBy: { email: string } | null;
};

function aggregateJobs(jobs: JobRow[], runs: RunRow[]) {
  const completed = jobs.filter((job) => job.status === 'COMPLETED').length;
  const failed = jobs.filter((job) => job.status === 'FAILED').length;
  const activeDurationByGame = new Map<string, number>();
  for (const run of runs) {
    activeDurationByGame.set(
      run.gameId,
      (activeDurationByGame.get(run.gameId) ?? 0) +
        elapsedMs(run.createdAt, run.completedAt),
    );
  }
  const completedDurations = jobs
    .filter(
      (job) => job.status === 'COMPLETED' && job.billingState !== 'REUSED',
    )
    .map((job) => activeDurationByGame.get(job.gameId) ?? 0)
    .filter((durationMs) => durationMs > 0);
  const byBillingState = countBy(jobs, (job) => job.billingState);
  const unlimitedAccounts = new Map<
    string,
    { email: string; jobs: number; completed: number; failed: number }
  >();
  for (const job of jobs.filter((item) =>
    ['UNLIMITED', 'SHADOW_UNLIMITED'].includes(item.billingState),
  )) {
    const email = job.requestedBy?.email ?? 'unknown';
    const account = unlimitedAccounts.get(email) ?? {
      email,
      jobs: 0,
      completed: 0,
      failed: 0,
    };
    account.jobs += 1;
    account[job.status === 'COMPLETED' ? 'completed' : 'failed'] += 1;
    unlimitedAccounts.set(email, account);
  }
  return {
    total: jobs.length,
    completed,
    failed,
    active: jobs.length - completed - failed,
    averageSeconds: completedDurations.length
      ? completedDurations.reduce(
          (total, durationMs) => total + durationMs,
          0,
        ) /
        completedDurations.length /
        1000
      : 0,
    byBillingState,
    unlimitedAccounts: [...unlimitedAccounts.values()],
  };
}

type CreditRow = { amount: number; type: string };
type StripeRow = { type: string; objectId: string | null; payload: unknown };

function aggregateBilling(entries: CreditRow[], stripeEvents: StripeRow[]) {
  const creditsByType = entries.reduce<Record<string, number>>(
    (result, row) => {
      result[row.type] = (result[row.type] ?? 0) + row.amount;
      return result;
    },
    {},
  );
  let grossRevenueCents = 0;
  const refundedByCharge = new Map<string, number>();
  for (const event of stripeEvents) {
    const object = stripeObject(event.payload);
    if (
      [
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
      ].includes(event.type) &&
      object.mode === 'payment' &&
      object.payment_status === 'paid'
    ) {
      grossRevenueCents += numberField(object.amount_total);
    } else if (event.type === 'invoice.paid') {
      grossRevenueCents += numberField(object.amount_paid);
    } else if (event.type === 'charge.refunded' && event.objectId) {
      refundedByCharge.set(
        event.objectId,
        Math.max(
          refundedByCharge.get(event.objectId) ?? 0,
          numberField(object.amount_refunded),
        ),
      );
    }
  }
  const refundedCents = [...refundedByCharge.values()].reduce(
    (sum, amount) => sum + amount,
    0,
  );
  return {
    creditsByType,
    purchasedCredits:
      (creditsByType['ONE_TIME_PURCHASE'] ?? 0) +
      (creditsByType['SUBSCRIPTION_GRANT'] ?? 0),
    consumedCredits: Math.abs(creditsByType['GENERATION_CONSUMPTION'] ?? 0),
    refundedCredits:
      (creditsByType['GENERATION_REFUND'] ?? 0) +
      Math.abs(creditsByType['PURCHASE_REFUND'] ?? 0),
    grossRevenueCents,
    refundedCents,
    netRevenueCents: grossRevenueCents - refundedCents,
  };
}

function stripeObject(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {};
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return {};
  const object = (data as { object?: unknown }).object;
  return object && typeof object === 'object'
    ? (object as Record<string, unknown>)
    : {};
}

function numberField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function aggregateErrors(calls: AiRow[], runs: RunRow[], jobs: JobRow[]) {
  const errors = new Map<
    string,
    { source: string; stage: string; message: string; count: number }
  >();
  const add = (source: string, stage: string, message: string | null) => {
    if (!message) return;
    const normalized = message.replace(/\s+/g, ' ').trim().slice(0, 500);
    const key = `${source}|${stage}|${normalized}`;
    const current = errors.get(key) ?? {
      source,
      stage,
      message: normalized,
      count: 0,
    };
    current.count += 1;
    errors.set(key, current);
  };
  calls.forEach((call) => add('openai', call.stage, call.error));
  runs.forEach((run) => add('pipeline', run.currentStage, run.error));
  jobs.forEach((job) => add('generation', 'SAGA', job.error));
  return [...errors.values()].sort((left, right) => right.count - left.count);
}

function countBy<T>(items: T[], key: (item: T) => string) {
  return items.reduce<Record<string, number>>((result, item) => {
    const value = key(item);
    result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {});
}

function elapsedMs(start: Date, end: Date | null): number {
  return end ? Math.max(0, end.getTime() - start.getTime()) : 0;
}

function ratio(part: number, whole: number): number {
  return whole ? part / whole : 0;
}

function microsToUsd(micros: number): number {
  return micros / 1_000_000;
}
