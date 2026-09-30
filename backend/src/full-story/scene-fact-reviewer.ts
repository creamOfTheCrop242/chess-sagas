import type { FullStoryProvider } from './full-story.provider';
import type { GenerationTelemetryContext } from '../openai/openai-generation';
import type { ValidationFinding } from '../story-validation/models/story-validation';
import { SceneValidationUnavailableError } from './scene-repair-coordinator';
import {
  sceneFactFindings,
  sceneFactHash,
  type FactReviewMode,
  type FactScene,
  type SceneFactContract,
  type SceneFactReview,
} from './scene-fact-contracts';

export interface FactReviewRecord {
  round: number;
  reviewAttempt?: number;
  hashes: string[];
  contracts: SceneFactContract[];
  review?: SceneFactReview;
  findings?: ValidationFinding[];
  error?: string;
}

/** Per-generation cache. A changed scene OR neighbor invalidates an assessment. */
export class SceneFactReviewSession {
  private readonly cache = new Map<string, ValidationFinding[]>();
  private readonly unavailable = new Map<string, string>();
  constructor(
    private readonly mode: FactReviewMode,
    private readonly reviewBatch: FullStoryProvider['reviewSceneFacts'],
    private readonly telemetry: GenerationTelemetryContext,
    private readonly record: (record: FactReviewRecord) => Promise<void>,
  ) {}

  async validate(
    contracts: SceneFactContract[],
    scenes: FactScene[],
    round: number,
  ): Promise<ValidationFinding[]> {
    // Narrow, mandatory checkmate obligations share the existing review call
    // and cache. Turning off broad review does not disable king-death checks.
    if (this.mode === 'off')
      contracts = contracts
        .map((c) => ({ ...c, facts: c.facts.filter((f) => f.requiredReview) }))
        .filter((c) => c.facts.length > 0);
    const enforcedIds = new Set(
      contracts.flatMap((c) =>
        c.facts
          .filter((f) => f.requiredReview || f.enforceConfirmed)
          .map((f) => f.id),
      ),
    );
    const entries = contracts.map((contract) => {
      const scene = scenes.find((s) => s.ply === contract.ply);
      if (!scene) throw new Error(`Missing scene ${contract.ply}`);
      const context = scenes.filter(
        (s) => Math.abs(s.ply - contract.ply) === 1,
      );
      return {
        contract,
        scene,
        context,
        hash: sceneFactHash(contract, scene, context),
      };
    });
    const missing = entries.filter(
      (e) => !this.cache.has(e.hash) && !this.unavailable.has(e.hash),
    );
    const failures: ValidationFinding[] = [];
    // Bound each call by both scene count and serialized payload size.
    while (missing.length) {
      const batch = [missing.shift()!];
      while (
        missing.length &&
        batch.length < 6 &&
        Buffer.byteLength(JSON.stringify([...batch, missing[0]])) < 48000
      )
        batch.push(missing.shift()!);
      let pending = batch;
      for (
        let reviewAttempt = 1;
        reviewAttempt <= 2 && pending.length;
        reviewAttempt++
      ) {
        const targets = new Set(pending.map((e) => e.scene.ply));
        const contextScenes = [
          ...new Map(
            pending
              .flatMap((e) => e.context)
              .filter((s) => !targets.has(s.ply))
              .map((s) => [s.ply, s]),
          ).values(),
        ];
        const batchContracts = pending.map((e) => e.contract);
        const batchScenes = pending.map((e) => e.scene);
        const errors: string[] = [];
        let review: SceneFactReview | undefined;
        const findings: ValidationFinding[] = [];
        try {
          review = await this.reviewBatch({
            contracts: batchContracts,
            scenes: batchScenes,
            contextScenes,
            telemetry: {
              ...this.telemetry,
              attempt: round + 1,
              repairMode: round ? 'partial' : 'none',
            },
          });
          for (const entry of pending) {
            try {
              const assessments = review.assessments.filter(
                (a) => a.contractId === entry.contract.id,
              );
              const result = sceneFactFindings(
                [entry.contract],
                [entry.scene],
                { assessments },
              );
              this.cache.set(entry.hash, result);
              findings.push(...result);
            } catch (error) {
              errors.push(
                error instanceof Error ? error.message : 'Malformed assessment',
              );
            }
          }
          const unexpected = review.assessments.filter(
            (a) => !batchContracts.some((c) => c.id === a.contractId),
          );
          if (unexpected.length)
            errors.push(
              `Ignored unexpected contracts: ${unexpected.map((a) => a.contractId).join(',')}`,
            );
        } catch (error) {
          errors.push(
            error instanceof Error ? error.message : 'Scene fact review failed',
          );
        }
        await this.record({
          round,
          reviewAttempt,
          hashes: pending.map((e) => e.hash),
          contracts: batchContracts,
          review,
          findings,
          ...(errors.length ? { error: errors.join('; ') } : {}),
        });
        pending = pending.filter((e) => !this.cache.has(e.hash));
        if (reviewAttempt === 2)
          for (const entry of pending)
            this.unavailable.set(
              entry.hash,
              errors.join('; ') || 'Incomplete assessment',
            );
      }
    }
    for (const entry of entries) {
      const message = this.unavailable.get(entry.hash);
      if (message) {
        if (
          this.mode === 'enforce' ||
          entry.contract.facts.some((f) => f.requiredReview)
        )
          throw new SceneValidationUnavailableError(
            `Scene fact review unavailable (not a prose contradiction): ${message}`,
          );
        failures.push({
          type: 'outline-continuity',
          severity: 'warning',
          ply: null,
          pieceId: null,
          excerpt: null,
          message: `Observation-only scene review unavailable for ply ${entry.scene.ply}: ${message}`,
        });
      }
    }
    const findings = [
      ...entries.flatMap((e) => this.cache.get(e.hash) ?? []),
      ...failures,
    ];
    return this.mode === 'observe'
      ? findings.map((f) =>
          enforcedIds.has(f.factId ?? '')
            ? f
            : {
                ...f,
                severity: 'warning',
                message: `[Observation only] ${f.message}`,
              },
        )
      : findings;
  }
}
