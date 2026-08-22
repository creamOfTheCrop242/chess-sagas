export interface ReportingAiGroup {
  stage?: string;
  model?: string;
  email?: string;
  calls: number;
  succeeded: number;
  failed: number;
  retryCalls: number;
  failureRate: number;
  averageSeconds: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  outputTokens: number;
  estimatedCostMicros: number;
  estimatedCostUsd: number;
}

export interface ReportingOverview {
  range: { from: string; to: string };
  summary: {
    completedSagas: number;
    failedSagas: number;
    sagaFailureRate: number;
    averageGenerationSeconds: number;
    aiCalls: number;
    aiCallFailures: number;
    aiFailureRate: number;
    retryCalls: number;
    estimatedAiCostMicros: number;
    estimatedAiCostUsd: number;
    averageAiCostPerCompletedSagaUsd: number;
    netRevenueCents: number;
    estimatedGrossMarginCents: number;
  };
  generation: {
    total: number;
    completed: number;
    failed: number;
    active: number;
    averageSeconds: number;
    byBillingState: Record<string, number>;
    unlimitedAccounts: Array<{
      email: string;
      jobs: number;
      completed: number;
      failed: number;
    }>;
  };
  pipeline: Array<{
    stage: string;
    attempts: number;
    completed: number;
    failed: number;
    failureRate: number;
    averageAttemptSeconds: number;
    firstPassCompleted: number;
    recoveredAfterRetry: number;
    exhausted: number;
  }>;
  ai: {
    total: ReportingAiGroup;
    customer: ReportingAiGroup;
    unlimited: ReportingAiGroup;
    anonymous: ReportingAiGroup;
    reused: ReportingAiGroup;
    byStageModel: ReportingAiGroup[];
    unlimitedAccounts: ReportingAiGroup[];
    byAttribution: Record<string, ReportingAiGroup>;
  };
  billing: {
    creditsByType: Record<string, number>;
    purchasedCredits: number;
    consumedCredits: number;
    refundedCredits: number;
    grossRevenueCents: number;
    refundedCents: number;
    netRevenueCents: number;
  };
  errors: Array<{
    source: string;
    stage: string;
    message: string;
    count: number;
  }>;
}
