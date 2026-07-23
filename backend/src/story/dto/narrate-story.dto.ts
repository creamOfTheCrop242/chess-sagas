import type {
  NearbyEnemy,
  PieceCode,
  Realms,
  TargetedEnemy,
} from '../../pgn/pgn.service';

export class NarrateStoryDto {
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
}
