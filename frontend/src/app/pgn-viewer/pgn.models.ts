export type PieceCode = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export type NearbyEnemy = {
  piece: PieceCode;
  square: string;
  color: 'w' | 'b';
  wing?: 'Eastern' | 'Western';
  distance: number;
};

export type TargetedEnemy = {
  piece: PieceCode;
  square: string;
  color: 'w' | 'b';
  wing?: 'Eastern' | 'Western';
};

export type ParsedPosition = {
  ply: number;
  san: string;
  fen: string;
  color: 'w' | 'b';
  piece: PieceCode;
  from: string;
  to: string;
  captured?: PieceCode;
  promotion?: PieceCode;
  isCapture: boolean;
  isCheck: boolean;
  isCheckmate: boolean;
  isCastle: boolean;
  nearbyEnemies: NearbyEnemy[];
  targetedEnemies: TargetedEnemy[];
};

export type Realms = {
  white: 'Light Kingdom';
  black: 'Dark Kingdom';
  whiteKingName?: string;
  blackKingName?: string;
};

export type ParsedPgn = {
  headers: Record<string, string>;
  startFen: string;
  positions: ParsedPosition[];
  realms: Realms;
  ledger: GameLedger;
};

export type PieceIdentity = {
  id: string;
  chessColor: 'w' | 'b';
  side: 'north' | 'south';
  originalSquare: string;
  chessType: PieceCode;
  currentChessType: PieceCode;
  fantasyType: string;
  permanentName: string;
  companyName?: string;
  viewpointName?: string;
  viewpointRole?: string;
  operatorName?: string;
  backstory?: string;
  alive: boolean;
  capturedAtPly?: number;
  promotedFromPawnId?: string;
};

export type ChessEvent = {
  ply: number;
  moveNumber: number;
  side: 'north' | 'south';
  san: string;
  from: string;
  to: string;
  pieceId: string;
  pieceType: string;
  isCapture: boolean;
  capturedPieceId?: string;
  capturedPieceType?: string;
  isCheck: boolean;
  isCheckmate: boolean;
  isCastle: boolean;
  castleSide?: 'king' | 'queen';
  isPromotion: boolean;
  promotionType?: string;
  isEnPassant: boolean;
  isQuietMove: boolean;
  boardFenAfterMove: string;
};

export type GameLedger = {
  metadata: Record<string, string | number | undefined>;
  initialFen: string;
  finalFen: string;
  pieces: PieceIdentity[];
  events: ChessEvent[];
  survivors: string[];
  capturedPieces: string[];
  promotedPieces: string[];
};

export type NarrateRequest = {
  ply: number;
  san: string;
  color: 'w' | 'b';
  piece: PieceCode;
  from: string;
  to: string;
  captured?: PieceCode;
  promotion?: PieceCode;
  isCapture: boolean;
  isCheck: boolean;
  isCheckmate: boolean;
  isCastle: boolean;
  nearbyEnemies?: NearbyEnemy[];
  targetedEnemies?: TargetedEnemy[];
  realms: Realms;
  previousStories?: string[];
};

export type NarrateResponse = {
  ply: number;
  story: string;
};

export type SavedGame = {
  id: string;
  ledger: { data: GameLedger };
};

export type SavedGameRecord = SavedGame & {
  rawPgn: string;
};

export type PlaybackScene = {
  id: string;
  actNumber: number;
  sceneNumber: number;
  startPly: number;
  endPly: number;
  involvedMoves: string[];
  fantasyNarration: string;
  chessExplanation: string;
  characters: string[];
  locations: string[];
  deaths: string[];
  captureActorId?: string | null;
  captureVictimId?: string | null;
  promotions: string[];
  visualPrompt: string;
  videoPrompt: string;
  estimatedDurationSeconds: number;
  continuityNotes: string[];
};

export type StoryWound = {
  pieceId: string;
  inflictedAtPly: number;
  injury: string;
  lastingEffects: string[];
  recoveryPly: number | null;
};

export type BattlefieldEnvironment = {
  id: string;
  name: string;
  description: string;
};

export type SceneBreakdownResponse = {
  status: 'COMPLETED';
  battlefieldEnvironment?: BattlefieldEnvironment | null;
  sceneBreakdown: {
    data: {
      scenes: PlaybackScene[];
      wounds?: StoryWound[];
      epilogue?: string | null;
      laterEpilogueHeading?: string | null;
      laterEpilogue?: string | null;
      defeatedKingDeathDescription?: string | null;
      defeatedKingFate?:
        | 'killed-after-checkmate'
        | 'breaks-seal-and-accepts-captivity'
        | 'abandons-seal-and-flees'
        | 'refuses-seal-destruction-and-is-imprisoned'
        | 'shatters-seal-in-defiance'
        | 'spends-seal-to-save-subjects'
        | 'executed-after-rejected-surrender'
        | 'survives';
      defeatedSealFate?: 'destroyed' | 'intact';
    };
  };
};

export type ArchiveRecordSummary = {
  id: string;
  title: string;
  whitePlayer: string;
  blackPlayer: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
};

export type ArchivedRecord = {
  id: string;
  rawPgn: string;
  whitePlayer: string;
  blackPlayer: string;
  result: string;
  createdAt: string;
  completedAt: string;
  ledger: { data: GameLedger };
  sceneBreakdown: SceneBreakdownResponse['sceneBreakdown'];
  battlefieldEnvironment?: BattlefieldEnvironment | null;
};

export type SagaStage =
  'analysis' | 'outline' | 'story' | 'validation' | 'scenes';

export type SagaStageState =
  | 'pending'
  | 'checking'
  | 'reused'
  | 'generating'
  | 'retrying'
  | 'completed'
  | 'failed';

export type PipelineStatus = Record<SagaStage, boolean>;

export interface SagaGenerationStatus {
  state: 'idle' | 'queued' | 'running' | 'completed' | 'failed';
  currentStage: SagaStage;
  error: string | null;
  stages: PipelineStatus;
}
