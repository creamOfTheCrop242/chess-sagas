import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

loadLocalEnvironment();

const hoursArgument = process.argv.find((argument) =>
  argument.startsWith('--hours='),
);
const hours = Number(hoursArgument?.split('=')[1] || 24);
if (!Number.isFinite(hours) || hours <= 0) {
  throw new Error('--hours must be a positive number');
}

const directory = process.env.AI_CALL_LOG_DIR || join(process.cwd(), 'logs');
const cutoff = Date.now() - hours * 60 * 60 * 1000;
const entries = existsSync(directory)
  ? readdirSync(directory)
      .filter((name) => /^openai-calls-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
      .flatMap((name) =>
        readFileSync(join(directory, name), 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line)),
      )
      .filter((entry) => Date.parse(entry.timestamp) >= cutoff)
  : [];

const groups = new Map();
for (const entry of entries) {
  const key = `${entry.stage}|${entry.model}`;
  const group = groups.get(key) || {
    stage: entry.stage,
    model: entry.model,
    succeeded: 0,
    failed: 0,
    durationMs: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    payloadBytes: 0,
    retryCalls: 0,
    fullRepairCalls: 0,
    partialRepairCalls: 0,
    estimatedCost: 0,
  };
  group[entry.status === 'SUCCEEDED' ? 'succeeded' : 'failed'] += 1;
  group.durationMs += entry.durationMs || 0;
  group.inputTokens += entry.inputTokens || 0;
  group.cachedInputTokens += entry.cachedInputTokens || 0;
  group.cacheWriteTokens += entry.cacheWriteTokens || 0;
  group.outputTokens += entry.outputTokens || 0;
  group.payloadBytes += entry.payloadBytes || 0;
  group.retryCalls += isRetry(entry) ? 1 : 0;
  group.fullRepairCalls += entry.repairMode === 'full' ? 1 : 0;
  group.partialRepairCalls += entry.repairMode === 'partial' ? 1 : 0;
  group.estimatedCost += estimateCost(entry);
  groups.set(key, group);
}

const totals = [...groups.values()].reduce(
  (total, group) => ({
    succeeded: total.succeeded + group.succeeded,
    failed: total.failed + group.failed,
    retryCalls: total.retryCalls + group.retryCalls,
    fullRepairCalls: total.fullRepairCalls + group.fullRepairCalls,
    partialRepairCalls: total.partialRepairCalls + group.partialRepairCalls,
    payloadBytes: total.payloadBytes + group.payloadBytes,
    estimatedCost: total.estimatedCost + group.estimatedCost,
  }),
  {
    succeeded: 0,
    failed: 0,
    retryCalls: 0,
    fullRepairCalls: 0,
    partialRepairCalls: 0,
    payloadBytes: 0,
    estimatedCost: 0,
  },
);
const calls = totals.succeeded + totals.failed;

console.log(`OpenAI calls in the last ${hours} hours`);
console.table(
  [...groups.values()].map((group) => {
    const groupCalls = group.succeeded + group.failed;
    return {
      stage: group.stage,
      model: group.model,
      calls: groupCalls,
      succeeded: group.succeeded,
      failed: group.failed,
      failureRate: groupCalls
        ? `${((group.failed / groupCalls) * 100).toFixed(1)}%`
        : '0.0%',
      averageSeconds: groupCalls
        ? (group.durationMs / groupCalls / 1000).toFixed(1)
        : '0.0',
      inputTokens: group.inputTokens,
      cachedInputTokens: group.cachedInputTokens,
      cacheWriteTokens: group.cacheWriteTokens,
      outputTokens: group.outputTokens,
      retryCalls: group.retryCalls,
      fullRepairs: group.fullRepairCalls,
      partialRepairs: group.partialRepairCalls,
      averagePayloadKB: groupCalls
        ? (group.payloadBytes / groupCalls / 1024).toFixed(1)
        : '0.0',
      estimatedCost: `$${group.estimatedCost.toFixed(4)}`,
    };
  }),
);
console.log(
  `Total: ${calls} calls, ${totals.succeeded} succeeded, ${totals.failed} failed, ${
    calls ? ((totals.failed / calls) * 100).toFixed(1) : '0.0'
  }% failure rate, ${totals.retryCalls} retry calls (${totals.fullRepairCalls} full repairs, ${totals.partialRepairCalls} partial repairs), ${(
    totals.payloadBytes /
    1024 /
    1024
  ).toFixed(
    2,
  )} MB submitted, $${totals.estimatedCost.toFixed(4)} estimated cost`,
);

const sagaCalls = [...groupCallsBySaga(entries).values()];
if (sagaCalls.length) {
  console.log('\nOpenAI usage by saga');
  console.table(
    sagaCalls.map((saga) => ({
      gameId: saga.gameId,
      calls: saga.calls,
      retryCalls: saga.retryCalls,
      fullRepairs: saga.fullRepairCalls,
      partialRepairs: saga.partialRepairCalls,
      failed: saga.failed,
      modelSeconds: (saga.durationMs / 1000).toFixed(1),
      callWindowSeconds: ((saga.endedAt - saga.startedAt) / 1000).toFixed(1),
      payloadKB: (saga.payloadBytes / 1024).toFixed(1),
      estimatedCost: `$${saga.estimatedCost.toFixed(4)}`,
    })),
  );
}

const failures = entries.filter((entry) => entry.status === 'FAILED');
if (failures.length) {
  console.log('\nFailures');
  console.table(
    failures.map(
      ({ timestamp, stage, model, durationMs, error, gameId, attempt }) => ({
        timestamp,
        stage,
        model,
        gameId: gameId || 'unknown',
        attempt: attempt || 1,
        seconds: (durationMs / 1000).toFixed(1),
        error,
      }),
    ),
  );
}

if (process.env.DATABASE_URL) {
  const databaseUrl = new URL(process.env.DATABASE_URL);
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(
    databaseUrl.hostname,
  );
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    const outcomes = await client.query(
      `SELECT "currentStage" AS stage, status, COUNT(*)::int AS count
       FROM "GenerationRun"
       WHERE "createdAt" >= $1
         AND status IN ('COMPLETED', 'FAILED')
       GROUP BY "currentStage", status
       ORDER BY "currentStage", status`,
      [new Date(cutoff)],
    );
    const pipelineGroups = new Map();
    for (const row of outcomes.rows) {
      const group = pipelineGroups.get(row.stage) || {
        stage: row.stage,
        completed: 0,
        failed: 0,
      };
      group[row.status === 'COMPLETED' ? 'completed' : 'failed'] = row.count;
      pipelineGroups.set(row.stage, group);
    }
    console.log(
      '\nPipeline outcomes (includes semantic and deterministic validation)',
    );
    console.table(
      [...pipelineGroups.values()].map((group) => {
        const attempts = group.completed + group.failed;
        return {
          stage: group.stage,
          attempts,
          completed: group.completed,
          failed: group.failed,
          failureRate: attempts
            ? `${((group.failed / attempts) * 100).toFixed(1)}%`
            : '0.0%',
        };
      }),
    );
    const pipelineAttempts = await client.query(
      `SELECT "gameId", "currentStage" AS stage, status, "createdAt", "completedAt"
       FROM "GenerationRun"
       WHERE "createdAt" >= $1
         AND status IN ('COMPLETED', 'FAILED')
       ORDER BY "gameId", "currentStage", "createdAt"`,
      [new Date(cutoff)],
    );
    const reliability = summarizePipelineReliability(pipelineAttempts.rows);
    if (reliability.length) {
      console.log('\nPipeline first-pass and retry reliability');
      console.table(reliability);
    }
    const sagaDurations = await client.query(
      `SELECT g.id AS "gameId", g."whitePlayer", g."blackPlayer",
              MIN(r."createdAt") AS "startedAt",
              MAX(r."completedAt") AS "completedAt",
              COUNT(*)::int AS attempts,
              BOOL_OR(
                r.status = 'COMPLETED'
                AND r."currentStage" = 'STORY'
                AND sb.id IS NOT NULL
              ) AS completed
       FROM "Game" g
       JOIN "GenerationRun" r ON r."gameId" = g.id
       LEFT JOIN "SceneBreakdown" sb ON sb."generationRunId" = r.id
       WHERE r."createdAt" >= $1
         AND r."completedAt" IS NOT NULL
       GROUP BY g.id, g."whitePlayer", g."blackPlayer"
       ORDER BY MAX(r."completedAt")`,
      [new Date(cutoff)],
    );
    if (sagaDurations.rows.length) {
      const usageByGame = new Map(sagaCalls.map((saga) => [saga.gameId, saga]));
      console.log('\nEnd-to-end saga outcomes');
      console.table(
        sagaDurations.rows.map((saga) => {
          const usage = usageByGame.get(saga.gameId);
          return {
            gameId: saga.gameId,
            game: `${saga.whitePlayer} vs ${saga.blackPlayer}`,
            completed: saga.completed,
            pipelineSeconds: (
              (Date.parse(saga.completedAt) - Date.parse(saga.startedAt)) /
              1000
            ).toFixed(1),
            stageAttempts: saga.attempts,
            openAiCalls: usage?.calls ?? 0,
            retryCalls: usage?.retryCalls ?? 0,
            estimatedCost: `$${(usage?.estimatedCost ?? 0).toFixed(4)}`,
          };
        }),
      );
    }
    const pipelineFailures = await client.query(
      `SELECT "createdAt", "currentStage" AS stage, model, error
       FROM "GenerationRun"
       WHERE "createdAt" >= $1 AND status = 'FAILED'
       ORDER BY "createdAt"`,
      [new Date(cutoff)],
    );
    if (pipelineFailures.rows.length) {
      console.log('\nPipeline failures');
      console.table(pipelineFailures.rows);
    }
  } catch (error) {
    console.warn(
      `Could not load pipeline outcomes: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

function isRetry(entry) {
  return (
    (entry.attempt || 1) > 1 ||
    (entry.repairMode && entry.repairMode !== 'none')
  );
}

function groupCallsBySaga(callEntries) {
  const sagas = new Map();
  for (const entry of callEntries) {
    if (!entry.gameId) continue;
    const endedAt = Date.parse(entry.timestamp);
    const startedAt = endedAt - (entry.durationMs || 0);
    const saga = sagas.get(entry.gameId) || {
      gameId: entry.gameId,
      calls: 0,
      retryCalls: 0,
      fullRepairCalls: 0,
      partialRepairCalls: 0,
      failed: 0,
      durationMs: 0,
      payloadBytes: 0,
      estimatedCost: 0,
      startedAt,
      endedAt,
    };
    saga.calls += 1;
    saga.retryCalls += isRetry(entry) ? 1 : 0;
    saga.fullRepairCalls += entry.repairMode === 'full' ? 1 : 0;
    saga.partialRepairCalls += entry.repairMode === 'partial' ? 1 : 0;
    saga.failed += entry.status === 'FAILED' ? 1 : 0;
    saga.durationMs += entry.durationMs || 0;
    saga.payloadBytes += entry.payloadBytes || 0;
    saga.estimatedCost += estimateCost(entry);
    saga.startedAt = Math.min(saga.startedAt, startedAt);
    saga.endedAt = Math.max(saga.endedAt, endedAt);
    sagas.set(entry.gameId, saga);
  }
  return sagas;
}

function summarizePipelineReliability(rows) {
  const runs = new Map();
  for (const row of rows) {
    const key = `${row.gameId}|${row.stage}`;
    const attempts = runs.get(key) || [];
    attempts.push(row);
    runs.set(key, attempts);
  }
  const stages = new Map();
  for (const attempts of runs.values()) {
    const stage = attempts[0].stage;
    const summary = stages.get(stage) || {
      stage,
      gameStages: 0,
      attempts: 0,
      firstPassCompleted: 0,
      recoveredAfterRetry: 0,
      exhausted: 0,
      durationMs: 0,
    };
    const completedIndex = attempts.findIndex(
      (attempt) => attempt.status === 'COMPLETED',
    );
    summary.gameStages += 1;
    summary.attempts += attempts.length;
    summary.firstPassCompleted += completedIndex === 0 ? 1 : 0;
    summary.recoveredAfterRetry += completedIndex > 0 ? 1 : 0;
    summary.exhausted += completedIndex === -1 ? 1 : 0;
    summary.durationMs += attempts.reduce(
      (total, attempt) =>
        total +
        Math.max(
          0,
          Date.parse(attempt.completedAt) - Date.parse(attempt.createdAt),
        ),
      0,
    );
    stages.set(stage, summary);
  }
  return [...stages.values()].map((stage) => ({
    stage: stage.stage,
    gameStages: stage.gameStages,
    attempts: stage.attempts,
    firstPassCompleted: stage.firstPassCompleted,
    recoveredAfterRetry: stage.recoveredAfterRetry,
    exhausted: stage.exhausted,
    averageAttemptSeconds: stage.attempts
      ? (stage.durationMs / stage.attempts / 1000).toFixed(1)
      : '0.0',
  }));
}

function estimateCost(entry) {
  const rates = {
    'gpt-5.6-luna': { input: 1, cached: 0.1, write: 1.25, output: 6 },
    'gpt-5.6-terra': { input: 2.5, cached: 0.25, write: 3.125, output: 15 },
    'gpt-5.6-sol': { input: 5, cached: 0.5, write: 6.25, output: 30 },
  }[entry.model];
  if (!rates) return 0;
  const cached = entry.cachedInputTokens || 0;
  const write = entry.cacheWriteTokens || 0;
  const uncached = Math.max(0, (entry.inputTokens || 0) - cached - write);
  return (
    (uncached * rates.input +
      cached * rates.cached +
      write * rates.write +
      (entry.outputTokens || 0) * rates.output) /
    1_000_000
  );
}

function loadLocalEnvironment() {
  const path = join(process.cwd(), '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/,
    );
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}
