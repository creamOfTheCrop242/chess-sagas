import type { GameLedger, PieceIdentity } from '../chess/models/game-ledger';
import type { NarrativeAnalysis } from '../narrative-analysis/models/narrative-analysis';
import type { StoryOutline } from './models/story-outline';

export const STORY_OUTLINE_PROVIDER = Symbol('STORY_OUTLINE_PROVIDER');

export interface StoryOutlineRequest {
  ledger: GameLedger;
  narrativeAnalysis: NarrativeAnalysis;
  characterRegistry: PieceIdentity[];
}

export interface StoryOutlineProvider {
  readonly model: string;
  generate(request: StoryOutlineRequest): Promise<StoryOutline>;
}
