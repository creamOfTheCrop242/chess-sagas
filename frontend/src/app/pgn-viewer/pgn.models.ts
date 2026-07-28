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

export type SavedGame = { id: string };

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
  promotions: string[];
  visualPrompt: string;
  videoPrompt: string;
  estimatedDurationSeconds: number;
  continuityNotes: string[];
};

export type SceneBreakdownResponse = {
  status: 'COMPLETED';
  sceneBreakdown: {
    data: { scenes: PlaybackScene[]; epilogue?: string | null };
  };
};

export type SagaStage =
  'analysis' | 'outline' | 'story' | 'validation' | 'scenes';

export type SagaStageState =
  'pending' | 'checking' | 'reused' | 'generating' | 'completed' | 'failed';
