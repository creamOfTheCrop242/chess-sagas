import type { GameLedger, PieceIdentity } from '../chess/models/game-ledger';
import type { NarrativeAnalysis } from '../narrative-analysis/models/narrative-analysis';
import type { StoryOutline } from '../story-outline/models/story-outline';
import type { GeneratedStoryDraft } from './models/generated-story';

export const FULL_STORY_PROVIDER = Symbol('FULL_STORY_PROVIDER');

export interface FullStoryRequest {
  ledger: GameLedger;
  narrativeAnalysis: NarrativeAnalysis;
  outline: StoryOutline;
  characterRegistry: PieceIdentity[];
}

export interface FullStoryProvider {
  readonly model: string;
  generate(request: FullStoryRequest): Promise<GeneratedStoryDraft>;
}
