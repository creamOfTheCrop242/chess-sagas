import { Injectable, NotFoundException } from '@nestjs/common';
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
    const rows = await this.prisma.saga.findMany({
      where: { ...where, ...search },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: query.limit + 1,
      include: sagaInclude,
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: page.map((saga) => this.mapSummary(saga)),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
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
