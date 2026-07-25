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
