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

  async findPublic(id: string) {
    const saga = await this.prisma.saga.findFirst({
      where: { id, visibility: 'PUBLIC' },
      include: {
        ...sagaInclude,
        game: {
          select: {
            ...sagaInclude.game.select,
            rawPgn: true,
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
    };
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
