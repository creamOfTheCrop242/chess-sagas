import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProfilesService } from './profiles.service';

describe('ProfilesService', () => {
  const prisma = {
    publicProfile: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    saga: { count: jest.fn() },
  };

  beforeEach(() => jest.clearAllMocks());

  it('creates a stable public profile from the authenticated user', async () => {
    prisma.publicProfile.findUnique.mockResolvedValueOnce(null);
    prisma.user.findUnique.mockResolvedValue({
      displayName: 'Sir Example',
      email: 'reader@example.com',
      avatarUrl: 'avatar.png',
    });
    prisma.publicProfile.create.mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      handle: 'sir-example',
    });
    const service = new ProfilesService(prisma as never);

    await expect(service.getOrCreate('user-1')).resolves.toMatchObject({
      handle: 'sir-example',
    });
    expect(prisma.publicProfile.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        handle: 'sir-example',
        displayName: 'Sir Example',
        avatarUrl: 'avatar.png',
      },
    });
  });

  it('does not expose a user id and hides saga count after attribution opt-out', async () => {
    prisma.publicProfile.findUnique.mockResolvedValue({
      userId: 'private-user-id',
      handle: 'hidden-scribe',
      displayName: 'Hidden Scribe',
      avatarUrl: null,
      bio: null,
      showCreatorCredit: false,
      createdAt: new Date('2026-08-07T00:00:00Z'),
    });
    const service = new ProfilesService(prisma as never);

    const result = await service.getPublic('hidden-scribe');

    expect(result).not.toHaveProperty('userId');
    expect(result.sagaCount).toBe(0);
    expect(prisma.saga.count).not.toHaveBeenCalled();
  });

  it('validates edits and reports duplicate handles clearly', async () => {
    prisma.publicProfile.findUnique.mockResolvedValue({ id: 'profile-1' });
    const service = new ProfilesService(prisma as never);
    await expect(service.update('user-1', { handle: '!!' })).rejects.toThrow(
      BadRequestException,
    );

    prisma.publicProfile.update.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.update('user-1', { handle: 'valid-handle' }),
    ).rejects.toThrow(ConflictException);
  });
});
