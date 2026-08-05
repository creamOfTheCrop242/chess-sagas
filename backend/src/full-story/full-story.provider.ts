import type { GameLedger, PieceIdentity } from '../chess/models/game-ledger';
import type { NarrativeAnalysis } from '../narrative-analysis/models/narrative-analysis';
import type { StoryOutline } from '../story-outline/models/story-outline';
import type { GeneratedStoryPackage } from './models/generated-story';
import type { GenerationTelemetryContext } from '../openai/openai-generation';

export const FULL_STORY_PROVIDER = Symbol('FULL_STORY_PROVIDER');

export interface CaptureDirective {
  ply: number;
  actorId: string;
  actorNames: string[];
  victimId: string;
  victimNames: string[];
  requiredOutcome: string;
}

export interface WoundTimelineDirective {
  pieceId: string;
  characterNames: string[];
  injury: string;
  lastingEffects: string[];
  prohibitedBeforePly: number;
  inflictedAtPly: number;
  activeThroughPly: number;
  recoveryPly: number | null;
}

export type FortressPowerOutcome = 'retains-seal-power' | 'loses-seal-power';

export interface SurvivingFortressOutcome {
  pieceId: string;
  operatorName: string;
  side: 'north' | 'south';
  powerOutcome: FortressPowerOutcome;
}

export interface EndingWorldState {
  termination: GameLedger['metadata']['termination'];
  defeatedSide: 'north' | 'south' | null;
  defeatedSealFate: 'destroyed' | 'intact';
  surrenderContext: NarrativeAnalysis['surrenderContext'];
  survivingFortresses: SurvivingFortressOutcome[];
}

export interface FullStoryRequest {
  ledger: GameLedger;
  narrativeAnalysis: NarrativeAnalysis;
  outline: StoryOutline;
  characterRegistry: PieceIdentity[];
  captureManifest: CaptureDirective[];
  woundTimeline: WoundTimelineDirective[];
  endingWorldState: EndingWorldState;
  validationFeedback?: string;
  telemetry: GenerationTelemetryContext;
}

export interface WoundSceneRepairRequest {
  scenes: Array<{
    ply: number;
    fantasyNarration: string;
    characters: string[];
    woundsInflicted: Array<{ pieceId: string; inflictedAtPly: number }>;
  }>;
  warnings: Array<{
    ply: number;
    pieceId: string | null;
    message: string;
    excerpt: string | null;
  }>;
  wounds: GeneratedStoryPackage['wounds'];
  woundTimeline: WoundTimelineDirective[];
  captureManifest: CaptureDirective[];
  characterRegistry: PieceIdentity[];
  telemetry: GenerationTelemetryContext;
}

export interface WoundSceneRepairResult {
  scenes: Array<{ ply: number; fantasyNarration: string }>;
}

export interface FullStoryProvider {
  readonly model: string;
  generate(request: FullStoryRequest): Promise<GeneratedStoryPackage>;
  repairWoundScenes(
    request: WoundSceneRepairRequest,
  ): Promise<WoundSceneRepairResult>;
}
