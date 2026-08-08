import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface UpdateProfileInput {
  handle?: unknown;
  displayName?: unknown;
  bio?: unknown;
  showCreatorCredit?: unknown;
}

const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])?$/;

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(userId: string) {
    const existing = await this.prisma.publicProfile.findUnique({
      where: { userId },
    });
    if (existing) return existing;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, email: true, avatarUrl: true },
    });
    if (!user) throw new NotFoundException('User was not found');
    const base = this.defaultHandle(
      user.displayName || user.email.split('@')[0],
    );
    for (let suffix = 0; suffix < 100; suffix += 1) {
      const handle = suffix === 0 ? base : `${base.slice(0, 26)}-${suffix + 1}`;
      try {
        return await this.prisma.publicProfile.create({
          data: {
            userId,
            handle,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error;
        const concurrentlyCreated = await this.prisma.publicProfile.findUnique({
          where: { userId },
        });
        if (concurrentlyCreated) return concurrentlyCreated;
      }
    }
    throw new ConflictException('A unique profile handle could not be created');
  }

  async getPublic(handle: string) {
    const normalized = this.normalizeHandle(handle);
    const profile = await this.prisma.publicProfile.findUnique({
      where: { handle: normalized },
      select: {
        handle: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        showCreatorCredit: true,
        createdAt: true,
        userId: true,
      },
    });
    if (!profile)
      throw new NotFoundException(`Profile ${normalized} was not found`);
    const sagaCount = profile.showCreatorCredit
      ? await this.prisma.saga.count({
          where: { creatorId: profile.userId, visibility: 'PUBLIC' },
        })
      : 0;
    return {
      handle: profile.handle,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      showCreatorCredit: profile.showCreatorCredit,
      createdAt: profile.createdAt,
      sagaCount,
    };
  }

  async update(userId: string, input: UpdateProfileInput) {
    const profile = await this.getOrCreate(userId);
    const data: {
      handle?: string;
      displayName?: string;
      bio?: string | null;
      showCreatorCredit?: boolean;
    } = {};
    if (input.handle !== undefined)
      data.handle = this.normalizeHandle(input.handle);
    if (input.displayName !== undefined) {
      if (typeof input.displayName !== 'string') {
        throw new BadRequestException('displayName must be a string');
      }
      const displayName = input.displayName.trim();
      if (!displayName || displayName.length > 80) {
        throw new BadRequestException('displayName must be 1 to 80 characters');
      }
      data.displayName = displayName;
    }
    if (input.bio !== undefined) {
      if (input.bio !== null && typeof input.bio !== 'string') {
        throw new BadRequestException('bio must be a string or null');
      }
      const bio = typeof input.bio === 'string' ? input.bio.trim() : null;
      if (bio && bio.length > 500) {
        throw new BadRequestException('bio must be 500 characters or fewer');
      }
      data.bio = bio || null;
    }
    if (input.showCreatorCredit !== undefined) {
      if (typeof input.showCreatorCredit !== 'boolean') {
        throw new BadRequestException('showCreatorCredit must be a boolean');
      }
      data.showCreatorCredit = input.showCreatorCredit;
    }
    try {
      return await this.prisma.publicProfile.update({
        where: { id: profile.id },
        data,
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('That profile handle is already in use');
      }
      throw error;
    }
  }

  private normalizeHandle(value: unknown): string {
    if (typeof value !== 'string') {
      throw new BadRequestException('handle must be a string');
    }
    const handle = value.trim().toLowerCase();
    if (!HANDLE_PATTERN.test(handle)) {
      throw new BadRequestException(
        'handle must be 3 to 30 lowercase letters, numbers, hyphens, or underscores',
      );
    }
    return handle;
  }

  private defaultHandle(value: string): string {
    const normalized = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30);
    if (normalized.length >= 3) return normalized;
    return `player-${normalized || 'saga'}`.slice(0, 30);
  }
}
