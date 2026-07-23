import type { GameLedger } from '../chess/models/game-ledger';
import type { NarrativeAnalysis } from './models/narrative-analysis';

export const NARRATIVE_ANALYSIS_PROVIDER = Symbol(
  'NARRATIVE_ANALYSIS_PROVIDER',
);

export interface NarrativeAnalysisRequest {
  ledger: GameLedger;
}

export interface NarrativeAnalysisProvider {
  readonly model: string;
  analyze(request: NarrativeAnalysisRequest): Promise<NarrativeAnalysis>;
}
