import type { GameLedger } from '../chess/models/game-ledger';
import type { NarrativeAnalysis } from './models/narrative-analysis';
import type { RequiredWoundEvent } from './wound-planning';

export const NARRATIVE_ANALYSIS_PROVIDER = Symbol(
  'NARRATIVE_ANALYSIS_PROVIDER',
);

export interface NarrativeAnalysisRequest {
  ledger: GameLedger;
  requiredWoundEvents: RequiredWoundEvent[];
}

export interface NarrativeAnalysisProvider {
  readonly model: string;
  analyze(request: NarrativeAnalysisRequest): Promise<NarrativeAnalysis>;
}
