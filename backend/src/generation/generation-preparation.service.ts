import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { selectBattlefieldEnvironment } from '../chess/battlefield-environment';
import type { GameLedger } from '../chess/models/game-ledger';
import { normalizePawnViewpoints } from '../chess/piece-identity.service';
import { classifySurrender } from '../chess/surrender-context';
import { PrismaService } from '../database/prisma.service';
import { selectRequiredWoundEvents } from '../narrative-analysis/wound-planning';

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

export interface PreparedGame {
  ledger: GameLedger;
  requiredWoundEvents: ReturnType<typeof selectRequiredWoundEvents>;
  battlefieldEnvironment: ReturnType<typeof selectBattlefieldEnvironment>;
  surrenderContext: ReturnType<typeof classifySurrender>;
}

interface CacheEntry {
  expiresAt: number;
  value: Promise<PreparedGame>;
}

@Injectable()
export class GenerationPreparationService {
  private readonly logger = new Logger(GenerationPreparationService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly activeStages = new Map<string, Promise<unknown>>();

  constructor(private readonly prisma: PrismaService) {}

  async prepare(gameId: string): Promise<PreparedGame> {
    const startedAt = Date.now();
    const cached = this.cache.get(gameId);
    if (cached && cached.expiresAt > startedAt) {
      this.touch(gameId, cached);
      const value = await cached.value;
      this.logTiming(gameId, 'hit', startedAt);
      return value;
    }
    if (cached) this.cache.delete(gameId);

    const value = this.load(gameId);
    const entry = { expiresAt: startedAt + CACHE_TTL_MS, value };
    this.cache.set(gameId, entry);
    this.evictOldestEntries();
    try {
      const prepared = await value;
      this.logTiming(gameId, 'miss', startedAt);
      return prepared;
    } catch (error) {
      if (this.cache.get(gameId) === entry) this.cache.delete(gameId);
      throw error;
    }
  }

  invalidate(gameId: string): void {
    this.cache.delete(gameId);
  }

  runStageOnce<T>(
    gameId: string,
    stage: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const key = `${gameId}:${stage}`;
    const active = this.activeStages.get(key) as Promise<T> | undefined;
    if (active) {
      this.logger.log(
        `Generation stage coalesced gameId=${gameId} stage=${stage}`,
      );
      return active;
    }
    const pending = work().finally(() => {
      if (this.activeStages.get(key) === pending) {
        this.activeStages.delete(key);
      }
    });
    this.activeStages.set(key, pending);
    return pending;
  }

  private async load(gameId: string): Promise<PreparedGame> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { ledger: { select: { data: true } } },
    });
    if (!game?.ledger) {
      throw new NotFoundException(`Game ${gameId} or its ledger was not found`);
    }
    const ledger = normalizePawnViewpoints(
      game.ledger.data as unknown as GameLedger,
    );
    return {
      ledger,
      requiredWoundEvents: selectRequiredWoundEvents(ledger),
      battlefieldEnvironment: selectBattlefieldEnvironment(ledger),
      surrenderContext: classifySurrender(ledger),
    };
  }

  private touch(gameId: string, entry: CacheEntry): void {
    this.cache.delete(gameId);
    this.cache.set(gameId, entry);
  }

  private evictOldestEntries(): void {
    while (this.cache.size > MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (!oldestKey) return;
      this.cache.delete(oldestKey);
    }
  }

  private logTiming(
    gameId: string,
    cache: 'hit' | 'miss',
    startedAt: number,
  ): void {
    this.logger.log(
      `Generation preparation gameId=${gameId} cache=${cache} durationMs=${Date.now() - startedAt}`,
    );
  }
}
