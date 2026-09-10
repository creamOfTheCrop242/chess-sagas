import { SceneBreakdownService } from './scene-breakdown.service';

describe('published scene share identity', () => {
  it.each(['saga-1', null])('returns a public saga ID when available: %s', async (id) => {
    const prisma = {
      generationRun: { findFirst: jest.fn().mockResolvedValueOnce({ id: 'run-1', sceneBreakdown: { data: { scenes: [] } } }).mockResolvedValueOnce(null) },
      saga: { findFirst: jest.fn().mockResolvedValue(id ? { id } : null) },
    };
    const result = await new SceneBreakdownService(prisma as never, {} as never, {} as never).findLatest('game-1');
    expect(result.sagaId).toBe(id);
    expect(prisma.saga.findFirst).toHaveBeenCalledWith({ where: { gameId: 'game-1', visibility: 'PUBLIC' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } });
  });
});
