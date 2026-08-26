import type { GameLedger, PieceIdentity } from '../chess/models/game-ledger';
import type { NarrativeAnalysis } from '../narrative-analysis/models/narrative-analysis';
import type { StoryOutline } from '../story-outline/models/story-outline';
import type { GeneratedStoryPackage } from './models/generated-story';
import type { GenerationTelemetryContext } from '../openai/openai-generation';
import type { WoundCauseType } from '../narrative-analysis/wound-planning';
import type {
  DeathCatalogId,
  DeathEventKind,
  DeathMethod,
  DeathTargetArea,
} from '../narrative-analysis/death-catalog';
import type {
  WoundBodyArea,
  WoundCatalogId,
  WoundEffect,
  WoundSeverity,
} from '../narrative-analysis/wound-catalog';

export const FULL_STORY_PROVIDER = Symbol('FULL_STORY_PROVIDER');

export interface CaptureDirective {
  ply: number;
  actorId: string;
  actorNames: string[];
  victimId: string;
  victimNames: string[];
  requiredOutcome: string;
}

export interface DeathBeatDirective {
  ply: number;
  authorizedVictimId: string | null;
  authorizedVictimNames: string[];
  noOtherDeaths: true;
  deathCatalogId: DeathCatalogId | null;
  eventKind: DeathEventKind | null;
  decisiveActorId: string | null;
  decisiveActorNames: string[];
  method: DeathMethod | null;
  targetArea: DeathTargetArea | null;
  narrationGuidance: string | null;
  forbiddenClaims: readonly string[];
}

export interface WoundTimelineDirective {
  woundId: string;
  pieceId: string;
  characterNames: string[];
  injury: string;
  lastingEffects: string[];
  prohibitedBeforePly: number;
  inflictedAtPly: number;
  activeThroughPly: number;
  recoveryPly: number | null;
  causeType: WoundCauseType;
  sourcePieceId: string | null;
  sourceNames: string[];
  woundCatalogId: WoundCatalogId;
  bodyArea: WoundBodyArea;
  severity: WoundSeverity;
  requiredEffects: readonly WoundEffect[];
  recoverability: 'recoverable-with-scar' | 'persistent' | 'permanent';
  narrationGuidance: string;
}

export interface CheckStrainDirective {
  ply: number;
  checkingPieceId: string;
  checkingPieceNames: string[];
  damagedKingId: string;
  damagedKingNames: string[];
  protectedKingId: string;
  protectedKingNames: string[];
}

export type FortressPowerOutcome = 'retains-seal-power' | 'loses-seal-power';

export interface SurvivingFortressOutcome {
  pieceId: string;
  operatorName: string;
  side: 'north' | 'south';
  powerOutcome: FortressPowerOutcome;
}

export type FortressOperatingState = 'operational' | 'damaged-but-mobile';

export interface FortressOperatingDirective {
  pieceId: string;
  operatorName: string;
  stateIntervals: Array<{
    startPly: number;
    endPly: number;
    state: FortressOperatingState;
  }>;
  afterBattleState:
    'destroyed-in-battle' | 'retains-seal-power' | 'depowered-by-seal-loss';
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
  deathContracts: DeathBeatDirective[];
  endingDeathContract: DeathBeatDirective | null;
  woundTimeline: WoundTimelineDirective[];
  woundStateByPly: Array<{
    ply: number;
    newlyInflictedWoundIds: string[];
    activeWoundIds: string[];
  }>;
  checkStrainTimeline: CheckStrainDirective[];
  fortressOperatingTimeline: FortressOperatingDirective[];
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
    woundReferences: Array<{ woundId: string; ownerPieceId: string }>;
  }>;
  warnings: Array<{
    ply: number;
    pieceId: string | null;
    message: string;
    excerpt: string | null;
  }>;
  repairContracts: Array<{
    key: string;
    ply: number;
    pieceId: string | null;
    characterName: string | null;
    requirement: string;
    forbiddenClaims: string[];
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

export interface StorySceneRepairRequest {
  scenes: Array<{
    ply: number;
    fantasyNarration: string;
    characters: string[];
    locations: string[];
    captureActorId: string | null;
    captureVictimId: string | null;
    victimDies: boolean;
    woundsInflicted: Array<{ pieceId: string; inflictedAtPly: number }>;
    woundReferences: Array<{ woundId: string; ownerPieceId: string }>;
  }>;
  contextScenes: Array<{ ply: number; fantasyNarration: string }>;
  findings: Array<{
    ply: number;
    pieceId: string | null;
    type: string;
    message: string;
    excerpt: string | null;
  }>;
  captureManifest: CaptureDirective[];
  deathContracts: Array<
    DeathBeatDirective & {
      mustRemainAlive: Array<{ pieceId: string; names: string[] }>;
    }
  >;
  woundTimeline: WoundTimelineDirective[];
  characterRegistry: PieceIdentity[];
  selectedRevengePayoffs: StoryOutline['selectedRevengePayoffs'];
  checkStrainTimeline: CheckStrainDirective[];
  fortressOperatingTimeline: FortressOperatingDirective[];
  telemetry: GenerationTelemetryContext;
}

export interface StorySceneRepairResult {
  scenes: Array<{ ply: number; fantasyNarration: string }>;
}

export interface SemanticDeathAdjudicationRequest {
  findings: Array<{
    findingIndex: number;
    ply: number;
    characterName: string;
    expectedStatus: 'survives-story' | 'alive-until-later-capture';
    capturedAtPly: number | null;
    flaggedExcerpt: string;
    sceneNarration: string;
  }>;
  telemetry: GenerationTelemetryContext;
}

export interface SemanticDeathAdjudicationResult {
  findings: Array<{
    findingIndex: number;
    contradiction: boolean;
    confidence: 'high' | 'medium' | 'low';
    rationale: string;
  }>;
}

export interface StorySectionRepairRequest {
  sections: Array<{
    sectionId: string;
    sectionPurpose: string;
    text: string;
  }>;
  findings: Array<{
    sectionId: string;
    type: string;
    message: string;
    excerpt: string | null;
  }>;
  characterRegistry: PieceIdentity[];
  endingWorldState: EndingWorldState;
  telemetry: GenerationTelemetryContext;
}

export interface StorySectionRepairResult {
  sections: Array<{ sectionId: string; text: string }>;
}

export interface FullStoryProvider {
  readonly model: string;
  generate(request: FullStoryRequest): Promise<GeneratedStoryPackage>;
  repairWoundScenes(
    request: WoundSceneRepairRequest,
  ): Promise<WoundSceneRepairResult>;
  repairStoryScenes(
    request: StorySceneRepairRequest,
  ): Promise<StorySceneRepairResult>;
  adjudicatePossiblePrematureDeaths(
    request: SemanticDeathAdjudicationRequest,
  ): Promise<SemanticDeathAdjudicationResult>;
  repairStorySections(
    request: StorySectionRepairRequest,
  ): Promise<StorySectionRepairResult>;
}
