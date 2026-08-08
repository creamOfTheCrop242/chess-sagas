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

export interface PieceIdentity {
  id: string;
  chessColor: ChessColor;
  side: Side;
  originalSquare: string;
  chessType: ChessPieceType;
  currentChessType: ChessPieceType;
  fantasyType: FantasyPieceType;
  permanentName: string;
  companyName?: string;
  viewpointName?: string;
  viewpointRole?: string;
  operatorName?: string;
  pronouns?: 'he/him' | 'she/her';
  backstory?: string;
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
  isCapture: boolean;
  capturedPieceId?: string;
  capturedPieceType?: FantasyPieceType;
  isCheck: boolean;
  isCheckmate: boolean;
  isCastle: boolean;
  castleSide?: 'king' | 'queen';
  isPromotion: boolean;
  promotionType?: FantasyPieceType;
  isEnPassant: boolean;
  isQuietMove: boolean;
  boardFenAfterMove: string;
  checkmateExplanation?: CheckmateExplanation;
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
