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
