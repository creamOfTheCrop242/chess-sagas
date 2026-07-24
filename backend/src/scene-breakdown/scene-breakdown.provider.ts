import type { GameLedger } from '../chess/models/game-ledger';
import type { StoryOutline } from '../story-outline/models/story-outline';
import type { SceneBreakdown } from './models/scene-breakdown';

export const SCENE_BREAKDOWN_PROVIDER = Symbol('SCENE_BREAKDOWN_PROVIDER');

export interface SceneBreakdownProvider {
  readonly model: string;
  generate(input: {
    ledger: GameLedger;
    outline: StoryOutline;
    validatedStoryMarkdown: string;
  }): Promise<SceneBreakdown>;
}
