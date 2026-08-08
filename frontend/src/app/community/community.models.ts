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
