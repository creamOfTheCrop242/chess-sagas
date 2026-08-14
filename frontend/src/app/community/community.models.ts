export interface SagaCreator {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface CommunitySagaSummary {
  id: string;
  gameId: string;
  title: string;
  whitePlayer: string;
  blackPlayer: string;
  result: string;
  visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  storyVersion: string | null;
  creator: SagaCreator | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
}

export interface SagaPage {
  items: CommunitySagaSummary[];
  nextCursor: string | null;
  total: number;
}

export interface ChampionEntry {
  id: string;
  rank: number;
  sagaId: string;
  gameId: string;
  pieceId: string;
  name: string;
  role: string;
  fantasyType: string;
  side: 'north' | 'south';
  kills: number;
  lastKillPly: number;
  status: 'Alive' | 'Dead';
  killedBy: string | null;
  backstory: string | null;
  battleTitle: string;
  battlefield: string | null;
  whitePlayer: string;
  blackPlayer: string;
  completedAt: string;
}

export interface ChampionStats {
  totalBattles: number;
  lightVictories: number;
  darkVictories: number;
  draws: number;
  unfinished: number;
  lightCaptures: number;
  darkCaptures: number;
  totalCaptures: number;
  averageCapturesPerBattle: number;
  lightMostLethalType: { fantasyType: string; captures: number } | null;
  darkMostLethalType: { fantasyType: string; captures: number } | null;
}

export interface PublicProfile {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  showCreatorCredit: boolean;
  createdAt: string;
  sagaCount: number;
}

export interface EditableProfile extends PublicProfile {
  id: string;
  userId: string;
}

export interface ProfileUpdate {
  handle?: string;
  displayName?: string;
  bio?: string | null;
  showCreatorCredit?: boolean;
}
