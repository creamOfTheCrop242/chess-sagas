import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { GameLedger } from '../chess/models/game-ledger';
import { PrismaService } from '../database/prisma.service';
import { FULL_STORY_PROMPT_VERSION } from '../full-story/full-story.prompt';
import { GenerationPreparationService } from '../generation/generation-preparation.service';
import {
  sceneBreakdownSchema,
  type SceneBreakdown,
} from './models/scene-breakdown';
import { SCENE_BREAKDOWN_PROMPT_VERSION } from './scene-breakdown.prompt';
import { SceneBreakdownValidator } from './scene-breakdown.validator';

@Injectable()
export class SceneBreakdownService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preparation: GenerationPreparationService,
    private readonly validator: SceneBreakdownValidator,
  ) {}

  async generate(gameId: string) {
    return this.preparation.runStageOnce(gameId, 'SCENE_BREAKDOWN', () =>
      this.generateOnce(gameId),
    );
  }

  private async generateOnce(gameId: string) {
    const [prepared, validationRun, storyRun] = await Promise.all([
      this.preparation.prepare(gameId),
      this.prisma.generationRun.findFirst({
        where: { gameId, currentStage: 'VALIDATION', status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        include: { storyValidation: true, sceneBreakdown: true },
      }),
      this.prisma.generationRun.findFirst({
        where: { gameId, currentStage: 'STORY', status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        include: { generatedStory: true, sceneBreakdown: true },
      }),
    ]);
    if (!validationRun?.storyValidation?.valid)
      throw new NotFoundException('Valid Phase 5 story required');
    const validatedBreakdown = validationRun.sceneBreakdown
      ? sceneBreakdownSchema.parse(validationRun.sceneBreakdown.data)
      : validationRun.storyValidation.repairedStoryMarkdown === null &&
          storyRun?.sceneBreakdown
        ? sceneBreakdownSchema.parse(storyRun.sceneBreakdown.data)
        : null;
    if (!validatedBreakdown) {
      throw new NotFoundException(
        'A validated structured story is required; regenerate validation with the current version',
      );
    }
    const run = await this.prisma.generationRun.create({
      data: {
        gameId,
        status: 'RUNNING',
        currentStage: 'SCENE_BREAKDOWN',
        model: 'deterministic',
        promptVersion: SCENE_BREAKDOWN_PROMPT_VERSION,
      },
    });
    try {
      const { ledger } = prepared;
      const breakdown = normalizeLedgerOwnedSceneFacts(
        validatedBreakdown,
        ledger,
      );
      this.validator.validate(breakdown, ledger);
      const data = JSON.parse(
        JSON.stringify(breakdown),
      ) as Prisma.InputJsonValue;
      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          error: null,
          sceneBreakdown: { create: { schemaVersion: 3, data } },
        },
      });
      return this.prisma.generationRun.findUnique({
        where: { id: run.id },
        include: { sceneBreakdown: true },
      });
    } catch (error) {
      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          error:
            error instanceof Error ? error.message : 'Scene generation failed',
        },
      });
      throw error;
    }
  }

  async findLatest(gameId: string) {
    const [run, analysisRun] = await Promise.all([
      this.prisma.generationRun.findFirst({
        where: {
          gameId,
          status: 'COMPLETED',
          OR: [
            {
              currentStage: 'STORY',
              promptVersion: FULL_STORY_PROMPT_VERSION,
            },
            {
              currentStage: 'SCENE_BREAKDOWN',
              promptVersion: SCENE_BREAKDOWN_PROMPT_VERSION,
            },
          ],
        },
        orderBy: { createdAt: 'desc' },
        include: { sceneBreakdown: true },
      }),
      this.prisma.generationRun.findFirst({
        where: {
          gameId,
          status: 'COMPLETED',
          currentStage: 'NARRATIVE_ANALYSIS',
          narrativeAnalysis: { isNot: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { narrativeAnalysis: { select: { data: true } } },
      }),
    ]);
    if (!run)
      throw new NotFoundException('No completed scene breakdown exists');
    const analysis = analysisRun?.narrativeAnalysis?.data;
    return {
      ...run,
      battlefieldEnvironment:
        analysis && typeof analysis === 'object'
          ? ((analysis as { battlefieldEnvironment?: unknown })
              .battlefieldEnvironment ?? null)
          : null,
    };
  }
}

export function normalizeLedgerOwnedSceneFacts(
  source: SceneBreakdown,
  ledger: GameLedger,
): SceneBreakdown {
  const sceneByPly = new Map(
    source.scenes.map((scene) => [scene.startPly, scene]),
  );
  let currentAct = 0;
  let sceneNumber = 0;
  const scenes = ledger.events.map((event) => {
    const scene = sceneByPly.get(event.ply);
    if (!scene) throw new Error(`Validated story omitted ply ${event.ply}`);
    if (scene.actNumber !== currentAct) {
      currentAct = scene.actNumber;
      sceneNumber = 1;
    } else {
      sceneNumber += 1;
    }
    return {
      ...scene,
      id: `ply-${event.ply}`,
      sceneNumber,
      startPly: event.ply,
      endPly: event.ply,
      involvedMoves: [event.san],
      deaths:
        event.isCapture && event.capturedPieceId ? [event.capturedPieceId] : [],
      captureActorId: event.isCapture ? event.pieceId : null,
      captureVictimId: event.capturedPieceId ?? null,
      promotions: event.isPromotion ? [event.pieceId] : [],
    };
  });

  const result = ledger.metadata?.result;
  const defeatedSide =
    result === '1-0' ? 'south' : result === '0-1' ? 'north' : null;
  const survivingFortressOutcomes = ledger.pieces
    .filter(
      (piece) =>
        piece.alive &&
        (piece.fantasyType === 'moving-fortress' ||
          piece.currentChessType === 'r'),
    )
    .map((piece) => ({
      pieceId: piece.id,
      operatorName:
        piece.operatorName ?? piece.viewpointName ?? piece.permanentName,
      side: piece.side,
      powerOutcome:
        defeatedSide === piece.side && source.defeatedSealFate === 'destroyed'
          ? ('loses-seal-power' as const)
          : ('retains-seal-power' as const),
    }));

  return sceneBreakdownSchema.parse({
    ...source,
    scenes,
    survivingFortressOutcomes,
  });
}
