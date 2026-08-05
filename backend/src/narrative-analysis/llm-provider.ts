import type { GameLedger } from '../chess/models/game-ledger';
import type { NarrativeAnalysis } from './models/narrative-analysis';
import type { RequiredWoundEvent } from './wound-planning';
import type { BattlefieldEnvironment } from '../chess/battlefield-environment';
import type { SurrenderContext } from '../chess/surrender-context';
import type { GenerationTelemetryContext } from '../openai/openai-generation';

export const NARRATIVE_ANALYSIS_PROVIDER = Symbol(
  'NARRATIVE_ANALYSIS_PROVIDER',
);

export interface NarrativeAnalysisRequest {
  ledger: GameLedger;
  requiredWoundEvents: RequiredWoundEvent[];
  battlefieldEnvironment: BattlefieldEnvironment;
  surrenderContext: SurrenderContext | null;
  telemetry: GenerationTelemetryContext;
}

export interface NarrativeAnalysisProvider {
  readonly model: string;
  analyze(request: NarrativeAnalysisRequest): Promise<NarrativeAnalysis>;
}
