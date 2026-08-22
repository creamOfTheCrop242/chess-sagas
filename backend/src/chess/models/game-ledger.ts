export type ChessColor = 'w' | 'b';
export type ChessPieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Side = 'north' | 'south';
export type FantasyPieceType =
  | 'king'
  | 'queen'
  | 'archwizard'
  | 'moving-fortress'
  | 'knight-commander'
  | 'grunt';
export type DeathDisposition =
  | 'defiant'
  | 'fearful'
  | 'resigned'
  | 'protective'
  | 'furious'
  | 'devout'
  | 'disbelieving'
  | 'calculating';
export type KingDisposition =
  | 'benevolent-guardian'
  | 'honorable-sovereign'
  | 'calculating-monarch'
  | 'selfish-tyrant';

export const QUIET_BEAT_PURPOSES = [
  'aftermath-reaction',
  'approaching-danger',
  'threat-recognition',
  'tactical-preparation',
  'relationship-development',
  'environmental-pressure',
  'backstory-reflection',
  'enemy-observation',
  'human-moment',
  'meaningful-travel',
] as const;
export type QuietBeatPurpose = (typeof QUIET_BEAT_PURPOSES)[number];

export interface PieceIdentity {
  id: string;
  chessColor: ChessColor;
  side: Side;
  originalSquare: string;
  chessType: ChessPieceType;
  currentChessType: ChessPieceType;
  fantasyType: FantasyPieceType;
  permanentName: string;
  characterName?: string;
  companyName?: string;
  viewpointName?: string;
  viewpointRole?: string;
  operatorName?: string;
  formerRole?: string;
  pronouns?: 'he/him' | 'she/her';
  deathDisposition?: DeathDisposition;
  kingDisposition?: KingDisposition;
  backstory?: string;
  mythicArm?: {
    id: import('../mythic-arms').MythicArmId;
    name: string;
    description: string;
  };
  alive: boolean;
  capturedAtPly?: number;
  promotedFromPawnId?: string;
}

export interface ChessEvent {
  ply: number;
  moveNumber: number;
  side: Side;
  san: string;
  from: string;
  to: string;
  pieceId: string;
  pieceType: FantasyPieceType;
  archwizardTravelMode?: 'walk' | 'teleport';
  queenTravelMode?: 'walk' | 'magical-rush';
  knightCommanderTravelMode?: 'walk' | 'spectral-mount';
  isCapture: boolean;
  capturedPieceId?: string;
  capturedPieceType?: FantasyPieceType;
  isCheck: boolean;
  isCheckmate: boolean;
  isCastle: boolean;
  castleSide?: 'king' | 'queen';
  castlingFortressId?: string;
  isPromotion: boolean;
  promotionType?: FantasyPieceType;
  isEnPassant: boolean;
  isQuietMove: boolean;
  quietBeatContext?: QuietBeatContext;
  boardFenAfterMove: string;
  tacticalContext?: TacticalContext;
  interactionContext?: InteractionContext;
  checkmateExplanation?: CheckmateExplanation;
}

export interface QuietBeatContext {
  purpose: QuietBeatPurpose;
  relatedEventPly?: number;
}

export interface TacticalContext {
  attacksPieceIds: string[];
  attackedByPieceIds: string[];
  forkedPieceIds: string[];
  checkResponse?: 'blocks-check' | 'captures-checker' | 'king-escape';
}

export interface InteractionContext {
  adjacentAllyPieceIds: string[];
  witnessedCapture?: {
    victimPieceId: string;
    killerPieceId: string;
    witnessPieceIds: string[];
  };
  avengesDeaths: Array<{
    victimPieceId: string;
    deathPly: number;
  }>;
}

export interface CheckmateExplanation {
  kingId: string;
  kingSquare: string;
  checkingPieceIds: string[];
  checkingSquares: string[];
  escapeSquares: Array<{
    square: string;
    reason: 'friendly-occupied' | 'enemy-controlled';
    occupiedByPieceId?: string;
    controlledByPieceIds: string[];
  }>;
  checkingPieces: Array<{
    pieceId: string;
    square: string;
    kingCanReach: boolean;
    protectedByPieceIds: string[];
  }>;
  interpositionSquares: string[];
  canCaptureCheckingPiece: false;
  canBlockCheck: false;
  legalResponseCount: 0;
}

export interface GameLedger {
  metadata: {
    date?: string;
    whitePlayer: string;
    blackPlayer: string;
    whiteElo?: number;
    blackElo?: number;
    result: '1-0' | '0-1' | '1/2-1/2' | '*';
    termination: 'checkmate' | 'resignation' | 'timeout' | 'draw' | 'unknown';
  };
  initialFen: string;
  finalFen: string;
  pieces: PieceIdentity[];
  events: ChessEvent[];
  survivors: string[];
  capturedPieces: string[];
  promotedPieces: string[];
}
