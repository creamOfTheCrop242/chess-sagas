import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { GameLedger } from '../chess/models/game-ledger';
import { PrismaService } from '../database/prisma.service';
import { PgnService } from '../pgn/pgn.service';
import { archiveBattleTitle } from '../story-outline/story-title';
import { NARRATIVE_ANALYSIS_PROMPT_VERSION } from '../narrative-analysis/narrative-analysis.prompt';
import { STORY_OUTLINE_PROMPT_VERSION } from '../story-outline/story-outline.prompt';
import { FULL_STORY_PROMPT_VERSION } from '../full-story/full-story.prompt';
import { SCENE_BREAKDOWN_PROMPT_VERSION } from '../scene-breakdown/scene-breakdown.prompt';

export const GAME_LEDGER_SCHEMA_VERSION = 5;

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pgn: PgnService,
  ) {}

  async create(rawPgn: string, ownerId?: string) {
    const parsed = this.pgn.parse(rawPgn);
    const canonicalPgn = rawPgn.trim();
    const pgnHash = createHash('sha256').update(canonicalPgn).digest('hex');
    let ledgerToPersist = parsed.ledger;
    const existing = await this.prisma.game.findFirst({
      where: { pgnHash },
      orderBy: { createdAt: 'desc' },
      include: { ledger: true },
    });
    if (existing) {
      if (
        existing.ledger &&
        existing.ledger.schemaVersion < GAME_LEDGER_SCHEMA_VERSION
      ) {
        if (existing.ledger.schemaVersion >= 4) {
          ledgerToPersist = preserveNarrativeIdentities(
            parsed.ledger,
            existing.ledger.data as unknown as GameLedger,
          );
        }
        const ledgerData = JSON.parse(
          JSON.stringify(ledgerToPersist),
        ) as Prisma.InputJsonValue;
        const ledger = await this.prisma.gameLedger.update({
          where: { gameId: existing.id },
          data: {
            schemaVersion: GAME_LEDGER_SCHEMA_VERSION,
            initialFen: parsed.ledger.initialFen,
            finalFen: parsed.ledger.finalFen,
            data: ledgerData,
          },
        });
        return { ...existing, ledger };
      }
      return existing;
    }

    const ledgerData = JSON.parse(
      JSON.stringify(ledgerToPersist),
    ) as Prisma.InputJsonValue;
    return this.prisma.game.create({
      data: {
        ownerId,
        pgnHash,
        rawPgn: canonicalPgn,
        whitePlayer: parsed.ledger.metadata.whitePlayer,
        blackPlayer: parsed.ledger.metadata.blackPlayer,
        result: parsed.ledger.metadata.result,
        ledger: {
          create: {
            schemaVersion: GAME_LEDGER_SCHEMA_VERSION,
            initialFen: parsed.ledger.initialFen,
            finalFen: parsed.ledger.finalFen,
            data: ledgerData,
          },
        },
      },
      include: { ledger: true },
    });
  }

  findAll() {
    return this.prisma.game.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        whitePlayer: true,
        blackPlayer: true,
        result: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async pipelineStatus(id: string) {
    const game = await this.prisma.game.findUnique({
      where: { id },
      select: {
        id: true,
        generationRuns: {
          where: { status: 'COMPLETED' },
          select: {
            currentStage: true,
            promptVersion: true,
            narrativeAnalysis: { select: { id: true } },
            storyOutline: { select: { id: true } },
            generatedStory: { select: { id: true } },
            storyValidation: { select: { valid: true } },
            sceneBreakdown: { select: { id: true } },
          },
        },
      },
    });
    if (!game) throw new NotFoundException(`Game ${id} was not found`);

    const runs = game.generationRuns;
    return {
      analysis: runs.some(
        (run) =>
          run.currentStage === 'NARRATIVE_ANALYSIS' &&
          run.promptVersion === NARRATIVE_ANALYSIS_PROMPT_VERSION &&
          Boolean(run.narrativeAnalysis),
      ),
      outline: runs.some(
        (run) =>
          run.currentStage === 'OUTLINE' &&
          run.promptVersion === STORY_OUTLINE_PROMPT_VERSION &&
          Boolean(run.storyOutline),
      ),
      story: runs.some(
        (run) =>
          run.currentStage === 'STORY' &&
          run.promptVersion === FULL_STORY_PROMPT_VERSION &&
          Boolean(run.generatedStory),
      ),
      validation: runs.some((run) => Boolean(run.storyValidation?.valid)),
      scenes: runs.some(
        (run) =>
          Boolean(run.sceneBreakdown) &&
          ((run.currentStage === 'STORY' &&
            run.promptVersion === FULL_STORY_PROMPT_VERSION) ||
            (run.currentStage === 'SCENE_BREAKDOWN' &&
              run.promptVersion === SCENE_BREAKDOWN_PROMPT_VERSION)),
      ),
    };
  }

  async findRecords() {
    const games = await this.prisma.game.findMany({
      where: {
        generationRuns: {
          some: {
            status: 'COMPLETED',
            sceneBreakdown: { isNot: null },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        whitePlayer: true,
        blackPlayer: true,
        result: true,
        createdAt: true,
        updatedAt: true,
        ledger: { select: { data: true } },
        generationRuns: {
          where: {
            status: 'COMPLETED',
            OR: [
              { sceneBreakdown: { isNot: null } },
              { generatedStory: { isNot: null } },
            ],
          },
          orderBy: { completedAt: 'desc' },
          select: {
            completedAt: true,
            sceneBreakdown: { select: { createdAt: true } },
            generatedStory: { select: { title: true } },
          },
        },
      },
    });
    return games.map(({ generationRuns, result: _result, ledger, ...game }) => {
      const sceneRun = generationRuns.find((run) => run.sceneBreakdown);
      const storyRun = generationRuns.find((run) => run.generatedStory);
      return {
        ...game,
        title: archiveBattleTitle(
          storyRun?.generatedStory?.title,
          ledger?.data as unknown as GameLedger,
          game.id,
        ),
        completedAt:
          sceneRun?.completedAt ??
          sceneRun?.sceneBreakdown?.createdAt ??
          game.updatedAt,
      };
    });
  }

  async findRecord(id: string) {
    const game = await this.prisma.game.findUnique({
      where: { id },
      select: {
        id: true,
        rawPgn: true,
        whitePlayer: true,
        blackPlayer: true,
        result: true,
        createdAt: true,
        ledger: { select: { data: true } },
        generationRuns: {
          where: {
            status: 'COMPLETED',
            sceneBreakdown: { isNot: null },
          },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: {
            completedAt: true,
            sceneBreakdown: {
              select: {
                data: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });
    if (!game) {
      throw new NotFoundException(`Game ${id} was not found`);
    }
    const latest = game.generationRuns[0];
    if (!latest?.sceneBreakdown) {
      throw new NotFoundException(`Game ${id} has no completed saga`);
    }
    const { generationRuns: _generationRuns, ...record } = game;
    return {
      ...record,
      completedAt:
        latest.completedAt ?? latest.sceneBreakdown.createdAt ?? game.createdAt,
      sceneBreakdown: latest.sceneBreakdown,
    };
  }

  async findOne(id: string) {
    const game = await this.prisma.game.findUnique({
      where: { id },
      include: {
        ledger: true,
        generationRuns: {
          include: {
            narrativeAnalysis: true,
            storyOutline: true,
            generatedStory: true,
            storyValidation: true,
            sceneBreakdown: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!game) {
      throw new NotFoundException(`Game ${id} was not found`);
    }
    return game;
  }
}

function preserveNarrativeIdentities(
  next: GameLedger,
  previous: GameLedger,
): GameLedger {
  const previousPieces = new Map(
    (previous.pieces ?? []).map((piece) => [piece.id, piece]),
  );
  return {
    ...next,
    pieces: next.pieces.map((piece) => {
      const existing = previousPieces.get(piece.id);
      if (!existing) return piece;
      return {
        ...piece,
        permanentName: existing.permanentName,
        companyName: existing.companyName,
        viewpointName: existing.viewpointName,
        viewpointRole: existing.viewpointRole,
        operatorName: existing.operatorName,
        backstory: existing.backstory ?? piece.backstory,
      };
    }),
  };
}
