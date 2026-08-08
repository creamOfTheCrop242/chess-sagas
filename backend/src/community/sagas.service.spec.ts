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
    saga: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
    sagaBookmark: { upsert: jest.fn(), deleteMany: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.saga.count.mockResolvedValue(2);
  });

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
    expect(result.total).toBe(2);
    expect(prisma.saga.count).toHaveBeenCalledWith({
      where: { visibility: 'PUBLIC' },
    });
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

    await expect(service.findAccessible('private-saga')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.saga.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'private-saga', visibility: 'PUBLIC' },
      }),
    );
  });

  it('lets a creator open their own non-public saga', async () => {
    prisma.saga.findFirst.mockResolvedValue(null);
    const service = new SagasService(prisma as never);

    await expect(
      service.findAccessible('private-saga', 'creator-1'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.saga.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'private-saga',
          OR: [{ visibility: 'PUBLIC' }, { creatorId: 'creator-1' }],
        },
      }),
    );
  });

  it('only bookmarks sagas that are publicly visible', async () => {
    prisma.saga.findFirst.mockResolvedValue({ id: 'saga-1' });
    prisma.sagaBookmark.upsert.mockResolvedValue({});
    const service = new SagasService(prisma as never);

    await expect(service.bookmark('user-1', 'saga-1')).resolves.toEqual({
      saved: true,
    });
    expect(prisma.sagaBookmark.upsert).toHaveBeenCalledWith({
      where: { userId_sagaId: { userId: 'user-1', sagaId: 'saga-1' } },
      create: { userId: 'user-1', sagaId: 'saga-1' },
      update: {},
    });
  });
});
