import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GameLedger } from '../chess/models/game-ledger';
import { PrismaService } from '../database/prisma.service';
import { archiveBattleTitle } from '../story-outline/story-title';
import { ParsedSagaListQuery } from './community-query';

const sagaInclude = {
  game: {
    select: {
      id: true,
      whitePlayer: true,
      blackPlayer: true,
      result: true,
      ledger: { select: { data: true } },
    },
  },
  generationRun: {
    select: {
      completedAt: true,
      generatedStory: { select: { title: true } },
      sceneBreakdown: { select: { createdAt: true } },
    },
  },
  creator: {
    select: {
      publicProfile: {
        select: {
          handle: true,
          displayName: true,
          avatarUrl: true,
          showCreatorCredit: true,
        },
      },
    },
  },
} as const;

type SagaSummaryRow = Prisma.SagaGetPayload<{ include: typeof sagaInclude }>;

@Injectable()
export class SagasService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(query: ParsedSagaListQuery) {
    return this.list({
      query,
      where: {
        visibility: 'PUBLIC',
        ...(query.creator
          ? {
              creator: {
                publicProfile: {
                  is: {
                    handle: query.creator,
                    showCreatorCredit: true,
                  },
                },
              },
            }
          : {}),
      } satisfies Prisma.SagaWhereInput,
    });
  }

  async listMine(userId: string, query: ParsedSagaListQuery) {
    return this.list({
      query,
      where: { creatorId: userId } satisfies Prisma.SagaWhereInput,
    });
  }

  async listSaved(userId: string, query: ParsedSagaListQuery) {
    return this.list({
      query,
      where: {
        visibility: 'PUBLIC',
        bookmarks: { some: { userId } },
      } satisfies Prisma.SagaWhereInput,
    });
  }

  async deleteArtifacts(sagaId: string) {
    const saga = await this.prisma.saga.findUnique({
      where: { id: sagaId },
      select: {
        gameId: true,
        game: {
          select: {
            sagaJob: { select: { status: true } },
          },
        },
      },
    });
    if (!saga) throw new NotFoundException(`Saga ${sagaId} was not found`);
    if (
      saga.game.sagaJob?.status === 'QUEUED' ||
      saga.game.sagaJob?.status === 'RUNNING'
    ) {
      throw new ConflictException(
        'Wait for the active saga generation to finish before deleting it',
      );
    }

    const [jobs, runs] = await this.prisma.$transaction([
      this.prisma.sagaGenerationJob.deleteMany({
        where: { gameId: saga.gameId },
      }),
      this.prisma.generationRun.deleteMany({
        where: { gameId: saga.gameId },
      }),
    ]);
    return {
      deleted: true as const,
      gameId: saga.gameId,
      deletedJobs: jobs.count,
      deletedRuns: runs.count,
      preservedGame: true as const,
    };
  }

  async champions(query: { side?: string; type?: string; limit?: string }) {
    const side =
      query.side === 'north' || query.side === 'south' ? query.side : undefined;
    const allowedTypes = new Set([
      'king',
      'queen',
      'moving-fortress',
      'archwizard',
      'knight-commander',
      'grunt',
    ]);
    const type =
      query.type && allowedTypes.has(query.type) ? query.type : undefined;
    const requestedLimit = Number.parseInt(query.limit ?? '50', 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, requestedLimit))
      : 50;
    const sagas = await this.prisma.saga.findMany({
      where: { visibility: 'PUBLIC' },
      select: {
        id: true,
        createdAt: true,
        game: {
          select: {
            id: true,
            whitePlayer: true,
            blackPlayer: true,
            ledger: { select: { data: true } },
          },
        },
        generationRun: {
          select: {
            completedAt: true,
            generatedStory: { select: { title: true } },
            narrativeAnalysis: { select: { data: true } },
          },
        },
      },
    });

    return sagas
      .flatMap((saga) => {
        const ledger = saga.game.ledger?.data as unknown as GameLedger | null;
        if (!ledger) return [];
        const pieces = new Map(ledger.pieces.map((piece) => [piece.id, piece]));
        const kills = new Map<string, { count: number; lastPly: number }>();
        for (const event of ledger.events) {
          if (!event.isCapture || !event.capturedPieceId) continue;
          const current = kills.get(event.pieceId) ?? { count: 0, lastPly: 0 };
          kills.set(event.pieceId, {
            count: current.count + 1,
            lastPly: event.ply,
          });
        }
        const environment = battlefieldEnvironmentFrom(
          saga.generationRun.narrativeAnalysis?.data,
        ) as { name?: string } | null;
        return [...kills.entries()].flatMap(([pieceId, performance]) => {
          const piece = pieces.get(pieceId);
          if (
            !piece ||
            (side && piece.side !== side) ||
            (type && piece.fantasyType !== type)
          ) {
            return [];
          }
          const killer = piece.capturedAtPly
            ? ledger.events.find((event) => event.capturedPieceId === piece.id)
                ?.pieceId
            : undefined;
          const killedBy = killer ? pieces.get(killer) : undefined;
          return [
            {
              id: `${saga.id}:${piece.id}`,
              sagaId: saga.id,
              gameId: saga.game.id,
              pieceId: piece.id,
              name: championName(piece),
              role: championRole(piece),
              fantasyType: piece.fantasyType,
              side: piece.side,
              kills: performance.count,
              lastKillPly: performance.lastPly,
              status: piece.alive ? 'Alive' : 'Dead',
              killedBy: killedBy ? championName(killedBy) : null,
              backstory: piece.backstory ?? null,
              battleTitle: archiveBattleTitle(
                saga.generationRun.generatedStory?.title,
                ledger,
                saga.game.id,
              ),
              battlefield: environment?.name ?? null,
              whitePlayer: saga.game.whitePlayer,
              blackPlayer: saga.game.blackPlayer,
              completedAt: saga.generationRun.completedAt ?? saga.createdAt,
            },
          ];
        });
      })
      .sort(
        (left, right) =>
          right.kills - left.kills ||
          left.lastKillPly - right.lastKillPly ||
          right.completedAt.getTime() - left.completedAt.getTime() ||
          left.id.localeCompare(right.id),
      )
      .slice(0, limit)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  async championStats() {
    const sagas = await this.prisma.saga.findMany({
      where: { visibility: 'PUBLIC' },
      select: {
        gameId: true,
        game: {
          select: {
            result: true,
            ledger: { select: { data: true } },
          },
        },
      },
    });
    const games = new Map(sagas.map((saga) => [saga.gameId, saga.game]));
    const stats = {
      totalBattles: games.size,
      lightVictories: 0,
      darkVictories: 0,
      draws: 0,
      unfinished: 0,
      lightCaptures: 0,
      darkCaptures: 0,
    };
    const capturesByType = {
      north: new Map<string, number>(),
      south: new Map<string, number>(),
    };

    for (const game of games.values()) {
      if (game.result === '1-0') stats.lightVictories += 1;
      else if (game.result === '0-1') stats.darkVictories += 1;
      else if (game.result === '1/2-1/2') stats.draws += 1;
      else stats.unfinished += 1;

      const ledger = game.ledger?.data as unknown as GameLedger | null;
      if (!ledger) continue;
      const pieces = new Map(ledger.pieces.map((piece) => [piece.id, piece]));
      for (const event of ledger.events) {
        if (!event.isCapture || !event.capturedPieceId) continue;
        const attacker = pieces.get(event.pieceId);
        if (!attacker) continue;
        if (attacker.side === 'north') stats.lightCaptures += 1;
        else stats.darkCaptures += 1;
        const realmTypes = capturesByType[attacker.side];
        realmTypes.set(
          attacker.fantasyType,
          (realmTypes.get(attacker.fantasyType) ?? 0) + 1,
        );
      }
    }

    const totalCaptures = stats.lightCaptures + stats.darkCaptures;
    return {
      ...stats,
      totalCaptures,
      averageCapturesPerBattle:
        stats.totalBattles === 0
          ? 0
          : Number((totalCaptures / stats.totalBattles).toFixed(1)),
      lightMostLethalType: mostLethalType(capturesByType.north),
      darkMostLethalType: mostLethalType(capturesByType.south),
    };
  }

  async bookmark(userId: string, sagaId: string) {
    await this.requirePublicSaga(sagaId);
    await this.prisma.sagaBookmark.upsert({
      where: { userId_sagaId: { userId, sagaId } },
      create: { userId, sagaId },
      update: {},
    });
    return { saved: true };
  }

  async removeBookmark(userId: string, sagaId: string) {
    await this.prisma.sagaBookmark.deleteMany({ where: { userId, sagaId } });
    return { saved: false };
  }

  async findAccessible(id: string, userId?: string) {
    const saga = await this.prisma.saga.findFirst({
      where: {
        id,
        ...(userId
          ? { OR: [{ visibility: 'PUBLIC' }, { creatorId: userId }] }
          : { visibility: 'PUBLIC' }),
      },
      include: {
        ...sagaInclude,
        game: {
          select: {
            ...sagaInclude.game.select,
            rawPgn: true,
            generationRuns: {
              where: {
                status: 'COMPLETED',
                currentStage: 'NARRATIVE_ANALYSIS',
                narrativeAnalysis: { isNot: null },
              },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                narrativeAnalysis: { select: { data: true } },
              },
            },
          },
        },
        generationRun: {
          select: {
            ...sagaInclude.generationRun.select,
            generatedStory: {
              select: { title: true, storyMarkdown: true },
            },
            sceneBreakdown: {
              select: { data: true, createdAt: true },
            },
          },
        },
      },
    });
    if (!saga) throw new NotFoundException(`Saga ${id} was not found`);
    const summary = this.mapSummary(saga);
    return {
      ...summary,
      rawPgn: saga.game.rawPgn,
      ledger: saga.game.ledger?.data ?? null,
      storyMarkdown: saga.generationRun.generatedStory?.storyMarkdown ?? null,
      sceneBreakdown: saga.generationRun.sceneBreakdown?.data ?? null,
      battlefieldEnvironment:
        battlefieldEnvironmentFrom(
          saga.game.generationRuns[0]?.narrativeAnalysis?.data,
        ) ?? null,
    };
  }

  private async requirePublicSaga(id: string): Promise<void> {
    const saga = await this.prisma.saga.findFirst({
      where: { id, visibility: 'PUBLIC' },
      select: { id: true },
    });
    if (!saga) throw new NotFoundException(`Saga ${id} was not found`);
  }

  private async list({
    query,
    where,
  }: {
    query: ParsedSagaListQuery;
    where: Prisma.SagaWhereInput;
  }) {
    const search: Prisma.SagaWhereInput = query.q
      ? {
          OR: [
            {
              game: { whitePlayer: { contains: query.q, mode: 'insensitive' } },
            },
            {
              game: { blackPlayer: { contains: query.q, mode: 'insensitive' } },
            },
            {
              generationRun: {
                generatedStory: {
                  is: { title: { contains: query.q, mode: 'insensitive' } },
                },
              },
            },
          ],
        }
      : {};
    const combinedWhere = { ...where, ...search };
    const [rows, total] = await Promise.all([
      this.prisma.saga.findMany({
        where: combinedWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        take: query.limit + 1,
        include: sagaInclude,
      }),
      this.prisma.saga.count({ where: combinedWhere }),
    ]);
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: page.map((saga) => this.mapSummary(saga)),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      total,
    };
  }

  private mapSummary(saga: SagaSummaryRow) {
    const profile = saga.creator?.publicProfile;
    return {
      id: saga.id,
      gameId: saga.game.id,
      title: archiveBattleTitle(
        saga.generationRun.generatedStory?.title,
        saga.game.ledger?.data as unknown as GameLedger,
        saga.game.id,
      ),
      whitePlayer: saga.game.whitePlayer,
      blackPlayer: saga.game.blackPlayer,
      result: saga.game.result,
      visibility: saga.visibility,
      storyVersion: saga.storyVersion,
      creator:
        profile?.showCreatorCredit === true
          ? {
              handle: profile.handle,
              displayName: profile.displayName,
              avatarUrl: profile.avatarUrl,
            }
          : null,
      createdAt: saga.createdAt,
      updatedAt: saga.updatedAt,
      completedAt:
        saga.generationRun.completedAt ??
        saga.generationRun.sceneBreakdown?.createdAt ??
        saga.createdAt,
    };
  }
}

function battlefieldEnvironmentFrom(value: unknown): unknown {
  if (!value || typeof value !== 'object') return null;
  return (value as { battlefieldEnvironment?: unknown }).battlefieldEnvironment;
}

function championName(piece: GameLedger['pieces'][number]): string {
  return (
    piece.viewpointName ??
    piece.operatorName ??
    piece.characterName ??
    piece.permanentName
  );
}

function championRole(piece: GameLedger['pieces'][number]): string {
  if (piece.chessType === 'p') return piece.viewpointRole ?? 'company soldier';
  if (piece.chessType === 'r') return 'Moving Fortress Pilot';
  return piece.fantasyType;
}

function mostLethalType(captures: Map<string, number>) {
  const winner = [...captures.entries()].sort(
    ([leftType, leftCount], [rightType, rightCount]) =>
      rightCount - leftCount || leftType.localeCompare(rightType),
  )[0];
  return winner ? { fantasyType: winner[0], captures: winner[1] } : null;
}
