import { NotFoundException } from '@nestjs/common';
import { SagasService } from './sagas.service';

function sagaRow(showCreatorCredit = true) {
  return {
    id: 'saga-1',
    gameId: 'game-1',
    generationRunId: 'run-1',
    creatorId: 'user-1',
    visibility: 'PUBLIC',
    storyVersion: 'v1',
    parentSagaId: null,
    createdAt: new Date('2026-08-07T00:00:00Z'),
    updatedAt: new Date('2026-08-07T00:01:00Z'),
    game: {
      id: 'game-1',
      whitePlayer: 'Light Player',
      blackPlayer: 'Dark Player',
      result: '1-0',
      ledger: null,
    },
    generationRun: {
      completedAt: new Date('2026-08-07T00:02:00Z'),
      generatedStory: { title: 'The Battle Under Ember Rain' },
      sceneBreakdown: { createdAt: new Date('2026-08-07T00:02:00Z') },
    },
    creator: {
      publicProfile: {
        handle: 'the-scribe',
        displayName: 'The Scribe',
        avatarUrl: null,
        showCreatorCredit,
      },
    },
  };
}

describe('SagasService', () => {
  const prisma = {
    saga: { findMany: jest.fn(), findFirst: jest.fn() },
  };

  beforeEach(() => jest.clearAllMocks());

  it('lists public sagas with cursor pagination and creator attribution', async () => {
    prisma.saga.findMany.mockResolvedValue([
      sagaRow(),
      { ...sagaRow(), id: 'saga-2' },
    ]);
    const service = new SagasService(prisma as never);

    const result = await service.listPublic({ limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].creator).toEqual({
      handle: 'the-scribe',
      displayName: 'The Scribe',
      avatarUrl: null,
    });
    expect(result.nextCursor).toBe('saga-1');
    expect(prisma.saga.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { visibility: 'PUBLIC' },
        take: 2,
      }),
    );
  });

  it('removes creator attribution when the profile opts out', async () => {
    prisma.saga.findMany.mockResolvedValue([sagaRow(false)]);
    const service = new SagasService(prisma as never);

    const result = await service.listPublic({ limit: 20 });

    expect(result.items[0].creator).toBeNull();
  });

  it('never returns a non-public saga from the public detail endpoint', async () => {
    prisma.saga.findFirst.mockResolvedValue(null);
    const service = new SagasService(prisma as never);

    await expect(service.findPublic('private-saga')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.saga.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'private-saga', visibility: 'PUBLIC' },
      }),
    );
  });
});
