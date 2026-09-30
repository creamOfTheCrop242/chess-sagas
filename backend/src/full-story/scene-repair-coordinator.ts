import type { ValidationFinding } from '../story-validation/models/story-validation';

export interface RepairScene {
  startPly: number;
  fantasyNarration: string;
}
export class SceneValidationUnavailableError extends Error {}
export interface SceneRevision<S> {
  round: number;
  scenes: S[];
  findings: ValidationFinding[];
  error?: string;
}

/** One shared budget, regardless of which kind of contradiction a patch creates. */
export async function coordinateSceneRepairs<S extends RepairScene>(options: {
  scenes: S[];
  validate: (scenes: S[], round: number) => Promise<ValidationFinding[]>;
  repair: (
    scenes: S[],
    targets: number[],
    findings: ValidationFinding[],
    round: number,
  ) => Promise<Array<{ ply: number; fantasyNarration: string }>>;
  apply: (scene: S, prose: string) => S;
  record: (revision: SceneRevision<S>) => Promise<void>;
}): Promise<{ scenes: S[]; findings: ValidationFinding[] }> {
  let candidate = options.scenes;
  let findings = await options.validate(candidate, 0);
  await options.record({ round: 0, scenes: candidate, findings });
  for (
    let round = 1;
    round <= 2 && findings.some((f) => f.severity === 'error');
    round++
  ) {
    const errors = findings.filter((f) => f.severity === 'error');
    if (
      errors.some(
        (f) => f.ply === null || !candidate.some((s) => s.startPly === f.ply),
      )
    )
      throw new Error('Blocking finding cannot be routed to a scene');
    const targets = [...new Set(errors.map((f) => f.ply as number))];
    try {
      const patches = await options.repair(candidate, targets, errors, round);
      const byPly = new Map(patches.map((p) => [p.ply, p]));
      if (
        patches.length !== targets.length ||
        byPly.size !== targets.length ||
        targets.some((p) => !byPly.has(p)) ||
        patches.some((p) => !p.fantasyNarration.trim())
      )
        throw new Error('Scene repair returned invalid or incomplete coverage');
      candidate = candidate.map((scene) =>
        byPly.has(scene.startPly)
          ? options.apply(scene, byPly.get(scene.startPly)!.fantasyNarration)
          : scene,
      );
      findings = await options.validate(candidate, round);
      await options.record({ round, scenes: candidate, findings });
    } catch (error) {
      await options.record({
        round,
        scenes: candidate,
        findings,
        error: error instanceof Error ? error.message : 'Scene repair failed',
      });
      if (error instanceof SceneValidationUnavailableError) throw error;
      if (round === 2) throw error;
    }
  }
  const errors = findings.filter((f) => f.severity === 'error');
  if (errors.length)
    throw new Error(
      `Targeted scene repair exhausted two rounds: ${errors.map((f) => `[${f.type}] ply=${f.ply} pieceId=${f.pieceId}: ${f.message}. Rejected prose: ${JSON.stringify(f.excerpt)}`).join('; ')}`,
    );
  return { scenes: candidate, findings };
}
