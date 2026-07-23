import type { GameLedger } from '../chess/models/game-ledger';
import type { NarrativeAnalysis } from '../narrative-analysis/models/narrative-analysis';
import type { StoryOutline } from '../story-outline/models/story-outline';
import type {
  StoryValidationResult,
  ValidationFinding,
} from './models/story-validation';

export const STORY_VALIDATION_PROVIDER = Symbol('STORY_VALIDATION_PROVIDER');

export interface StoryValidationRequest {
  ledger: GameLedger;
  narrativeAnalysis: NarrativeAnalysis;
  outline: StoryOutline;
  title: string;
  storyMarkdown: string;
  deterministicFindings: ValidationFinding[];
}

export interface StoryValidationProvider {
  readonly model: string;
  validate(request: StoryValidationRequest): Promise<StoryValidationResult>;
}
