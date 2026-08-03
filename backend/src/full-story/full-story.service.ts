import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { GameLedger } from '../chess/models/game-ledger';
import {
  isSurrenderKingFate,
  kingDiesFromFate,
  sealFateForKingFate,
} from '../chess/models/story-ending';
import { normalizePawnViewpoints } from '../chess/piece-identity.service';
import { PrismaService } from '../database/prisma.service';
import { narrativeAnalysisSchema } from '../narrative-analysis/models/narrative-analysis';
import { NARRATIVE_ANALYSIS_PROMPT_VERSION } from '../narrative-analysis/narrative-analysis.prompt';
import { SceneBreakdownValidator } from '../scene-breakdown/scene-breakdown.validator';
import type { SceneBreakdown } from '../scene-breakdown/models/scene-breakdown';
import { storyOutlineSchema } from '../story-outline/models/story-outline';
import { STORY_OUTLINE_PROMPT_VERSION } from '../story-outline/story-outline.prompt';
import { DeterministicStoryValidator } from '../story-validation/deterministic-story.validator';
import {
  FULL_STORY_PROVIDER,
  type FullStoryProvider,
} from './full-story.provider';
import { FULL_STORY_PROMPT_VERSION } from './full-story.prompt';
import { FullStoryValidator } from './full-story.validator';
import {
  generatedStoryPackageSchema,
  type GeneratedStoryDraft,
  type GeneratedStoryPackage,
} from './models/generated-story';

@Injectable()
export class FullStoryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FULL_STORY_PROVIDER)
    private readonly provider: FullStoryProvider,
    private readonly validator: FullStoryValidator,
    private readonly sceneValidator: SceneBreakdownValidator,
    private readonly deterministic: DeterministicStoryValidator,
  ) {}

  async generate(gameId: string, validationFeedback?: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, ledger: { select: { data: true } } },
    });
    if (!game?.ledger) {
      throw new NotFoundException(`Game ${gameId} or its ledger was not found`);
    }
    const [analysisRun, outlineRun] = await Promise.all([
      this.prisma.generationRun.findFirst({
        where: {
          gameId,
          currentStage: 'NARRATIVE_ANALYSIS',
          status: 'COMPLETED',
          promptVersion: NARRATIVE_ANALYSIS_PROMPT_VERSION,
        },
        orderBy: { createdAt: 'desc' },
        include: { narrativeAnalysis: true },
      }),
      this.prisma.generationRun.findFirst({
        where: {
          gameId,
          currentStage: 'OUTLINE',
          status: 'COMPLETED',
          promptVersion: STORY_OUTLINE_PROMPT_VERSION,
        },
        orderBy: { createdAt: 'desc' },
        include: { storyOutline: true },
      }),
    ]);
    if (!analysisRun?.narrativeAnalysis) {
      throw new NotFoundException(
        `Generate a completed narrative analysis for game ${gameId} first`,
      );
    }
    if (!outlineRun?.storyOutline) {
      throw new NotFoundException(
        `Generate a completed story outline for game ${gameId} first`,
      );
    }

    const run = await this.prisma.generationRun.create({
      data: {
        gameId,
        status: 'RUNNING',
        currentStage: 'STORY',
        model: this.provider.model,
        promptVersion: FULL_STORY_PROMPT_VERSION,
      },
    });
    try {
      const ledger = normalizePawnViewpoints(
        game.ledger.data as unknown as GameLedger,
      );
      const narrativeAnalysis = narrativeAnalysisSchema.parse(
        analysisRun.narrativeAnalysis.data,
      );
      const outline = storyOutlineSchema.parse(outlineRun.storyOutline.data);
      const storyPackage = generatedStoryPackageSchema.parse(
        await this.provider.generate({
          ledger,
          narrativeAnalysis,
          outline,
          characterRegistry: ledger.pieces,
          validationFeedback: validationFeedback?.trim().slice(0, 4_000),
        }),
      );
      if (
        JSON.stringify(storyPackage.battlefieldEnvironment) !==
          JSON.stringify(narrativeAnalysis.battlefieldEnvironment) ||
        JSON.stringify(storyPackage.battlefieldEnvironment) !==
          JSON.stringify(outline.battlefieldEnvironment)
      ) {
        throw new Error(
          'Story package battlefield environment must match analysis and outline',
        );
      }
      if (
        !isAllowedDefeatedKingFate(
          ledger.metadata.termination,
          storyPackage.defeatedKingFate,
        ) ||
        storyPackage.defeatedKingFate !==
          narrativeAnalysis.endingPlan.defeatedKingFate
      ) {
        throw new Error(
          `Story package has incorrect defeated King fate for ${ledger.metadata.termination}`,
        );
      }
      if (
        kingDiesFromFate(storyPackage.defeatedKingFate) !==
        (storyPackage.defeatedKingDeathDescription !== null)
      ) {
        throw new Error(
          'Story package has incorrect defeated King death description',
        );
      }
      const expectedSealFate = sealFateForKingFate(
        storyPackage.defeatedKingFate,
      );
      if (storyPackage.defeatedSealFate !== expectedSealFate) {
        throw new Error(
          `Story package has incorrect defeated Royal Seal fate for ${ledger.metadata.termination}`,
        );
      }
      const expectedWounds = new Map(
        outline.woundBeats.map((wound) => [
          `${wound.pieceId}:${wound.inflictedAtPly}`,
          wound,
        ]),
      );
      const returnedWounds = new Map(
        storyPackage.wounds.map((wound) => [
          `${wound.pieceId}:${wound.inflictedAtPly}`,
          wound,
        ]),
      );
      if (
        expectedWounds.size !== returnedWounds.size ||
        [...expectedWounds].some(([key, expected]) => {
          const returned = returnedWounds.get(key);
          return (
            !returned ||
            returned.injury !== expected.injury ||
            returned.recoveryPly !== expected.recoveryPly
          );
        })
      ) {
        throw new Error(
          'Story package wound ledger must match the validated outline',
        );
      }
      const pieceIds = new Set(ledger.pieces.map((piece) => piece.id));
      const sceneNumbers = new Map<number, number>();
      const scenes = storyPackage.scenes.map((creativeScene) => {
        const event = ledger.events[creativeScene.ply - 1];
        if (!event || event.ply !== creativeScene.ply) {
          throw new Error(
            `Story package has no ledger event for ply ${creativeScene.ply}`,
          );
        }
        const act =
          outline.acts.find(
            (candidate) =>
              event.ply >= candidate.startPly && event.ply <= candidate.endPly,
          ) || outline.acts[outline.acts.length - 1];
        const sceneNumber = (sceneNumbers.get(act.actNumber) || 0) + 1;
        sceneNumbers.set(act.actNumber, sceneNumber);
        const characters = [
          event.pieceId,
          ...(event.capturedPieceId ? [event.capturedPieceId] : []),
          ...creativeScene.characters.filter((id) => pieceIds.has(id)),
        ].filter((id, index, all) => all.indexOf(id) === index);
        const fantasyNarration = this.cleanReaderFacingProse(
          creativeScene.fantasyNarration,
          [...pieceIds],
        );
        const wordCount = fantasyNarration.trim().split(/\s+/).length;
        return {
          id: `act-${act.actNumber}-scene-${sceneNumber}`,
          actNumber: act.actNumber,
          sceneNumber,
          startPly: event.ply,
          endPly: event.ply,
          involvedMoves: [event.san],
          chessExplanation: `${event.san}: ${event.pieceType} moves from ${event.from} to ${event.to}.`,
          fantasyNarration,
          characters,
          locations: creativeScene.locations,
          deaths: event.capturedPieceId ? [event.capturedPieceId] : [],
          promotions: event.isPromotion ? [event.pieceId] : [],
          visualPrompt: fantasyNarration,
          videoPrompt: fantasyNarration,
          estimatedDurationSeconds: Math.max(8, Math.ceil(wordCount / 2.5)),
          continuityNotes: [],
        };
      });
      const timedFateFindings = this.deterministic.validateTimedCharacterFates(
        scenes.map((scene) => ({
          ply: scene.startPly,
          fantasyNarration: scene.fantasyNarration,
        })),
        ledger,
      );
      const captureAttributionFindings =
        this.deterministic.validateCaptureAttribution(
          scenes.map((scene) => ({
            ply: scene.startPly,
            fantasyNarration: scene.fantasyNarration,
          })),
          ledger,
        );
      if (captureAttributionFindings.length > 0) {
        throw new Error(
          `Generated story package contains capture attribution errors: ${captureAttributionFindings
            .map((finding) => finding.message)
            .join('; ')}`,
        );
      }
      if (timedFateFindings.length > 0) {
        throw new Error(
          `Generated story package contains premature character deaths: ${timedFateFindings
            .map((finding) => finding.message)
            .join('; ')}`,
        );
      }
      const timedWoundFindings = this.deterministic.validateTimedWounds(
        scenes.map((scene, index) => ({
          ply: scene.startPly,
          fantasyNarration: scene.fantasyNarration,
          characters: scene.characters,
          woundsInflicted: storyPackage.scenes[index]?.woundsInflicted ?? [],
        })),
        storyPackage.wounds,
        ledger,
      );
      if (timedWoundFindings.length > 0) {
        throw new Error(
          `Generated story package contains wound timeline errors: ${timedWoundFindings
            .map((finding) => finding.message)
            .join('; ')}`,
        );
      }
      const epilogue = this.cleanReaderFacingProse(storyPackage.epilogue, [
        ...pieceIds,
      ]);
      const laterEpilogueHeading = this.cleanReaderFacingProse(
        storyPackage.laterEpilogueHeading,
        [...pieceIds],
      );
      const laterEpilogue = this.cleanReaderFacingProse(
        storyPackage.laterEpilogue,
        [...pieceIds],
      );
      const defeatedKingDeathDescription =
        storyPackage.defeatedKingDeathDescription === null
          ? null
          : this.cleanReaderFacingProse(
              storyPackage.defeatedKingDeathDescription,
              [...pieceIds],
            );
      const breakdown: SceneBreakdown = {
        scenes,
        wounds: storyPackage.wounds,
        epilogue,
        laterEpilogueHeading,
        laterEpilogue,
        defeatedKingDeathDescription,
        defeatedKingFate: storyPackage.defeatedKingFate,
        defeatedSealFate: storyPackage.defeatedSealFate,
      };
      this.sceneValidator.validate(breakdown, ledger);
      const story: GeneratedStoryDraft = {
        title: storyPackage.title,
        storyMarkdown: assembleStoryMarkdown(
          scenes,
          outline.acts.map((act) =>
            this.cleanReaderFacingProse(act.title, [...pieceIds]),
          ),
          epilogue,
          laterEpilogueHeading,
          laterEpilogue,
        ),
      };
      this.validator.validate(story, ledger, outline);
      const deterministicFindings = this.deterministic.validate(
        story.storyMarkdown,
        ledger,
      );
      if (deterministicFindings.length > 0) {
        throw new Error(
          `Generated story package contains deterministic errors: ${deterministicFindings
            .map((finding) => finding.message)
            .join('; ')}`,
        );
      }
      const breakdownData = JSON.parse(
        JSON.stringify(breakdown),
      ) as Prisma.InputJsonValue;

      const completedRun = await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          error: null,
          generatedStory: {
            create: {
              schemaVersion: 1,
              title: story.title,
              storyMarkdown: story.storyMarkdown,
            },
          },
          sceneBreakdown: {
            create: {
              schemaVersion: 2,
              data: breakdownData,
            },
          },
        },
        include: { generatedStory: true, sceneBreakdown: true },
      });
      if (!completedRun.generatedStory) {
        throw new Error('Generated story was not persisted');
      }
      await this.prisma.generationRun.create({
        data: {
          gameId,
          status: 'COMPLETED',
          currentStage: 'VALIDATION',
          model: 'deterministic',
          promptVersion: 'local-package-v1',
          completedAt: new Date(),
          storyValidation: {
            create: {
              sourceStoryId: completedRun.generatedStory.id,
              schemaVersion: 2,
              valid: true,
              findings: [],
              repairedStoryMarkdown: null,
            },
          },
        },
      });
      return completedRun;
    } catch (error) {
      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          error:
            error instanceof Error ? error.message : 'Story generation failed',
        },
      });
      throw error;
    }
  }

  async findLatest(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true },
    });
    if (!game) {
      throw new NotFoundException(`Game ${gameId} was not found`);
    }
    const run = await this.prisma.generationRun.findFirst({
      where: {
        gameId,
        currentStage: 'STORY',
        status: 'COMPLETED',
        promptVersion: FULL_STORY_PROMPT_VERSION,
      },
      orderBy: { createdAt: 'desc' },
      include: { generatedStory: true },
    });
    if (!run) {
      throw new NotFoundException(
        `No completed full story exists for game ${gameId}`,
      );
    }
    return run;
  }

  private cleanReaderFacingProse(prose: string, pieceIds: string[]): string {
    let cleaned = this.deterministic
      .repairProhibitedTerminology(prose)
      .replace(/\b[a-h][1-8]\b/gi, 'the battlefield')
      .replace(/\bthe\s+the battlefield\b/gi, 'the battlefield');
    pieceIds.forEach((pieceId) => {
      cleaned = cleaned.replaceAll(pieceId, 'the warrior');
    });
    return cleaned;
  }
}

export function assembleStoryMarkdown(
  scenes: SceneBreakdown['scenes'],
  actTitles: string[],
  epilogue?: string,
  laterEpilogueHeading?: string,
  laterEpilogue?: string,
): string {
  const sections: string[] = [];
  let currentAct = 0;
  scenes.forEach((scene) => {
    if (scene.actNumber !== currentAct) {
      currentAct = scene.actNumber;
      const title = (actTitles[currentAct - 1] || `Act ${currentAct}`).replace(
        /\b[a-h][1-8]\b/gi,
        'battlefield',
      );
      sections.push(`## Act ${currentAct}: ${title}`);
    }
    sections.push(scene.fantasyNarration);
  });
  if (epilogue) {
    sections.push('## Immediate Aftermath', epilogue);
  }
  if (laterEpilogue) {
    sections.push(
      `## ${laterEpilogueHeading || 'The Later Chronicle'}`,
      laterEpilogue,
    );
  }
  return sections.join('\n\n');
}

export function isAllowedDefeatedKingFate(
  termination: GameLedger['metadata']['termination'],
  fate: GeneratedStoryPackage['defeatedKingFate'],
): boolean {
  if (termination === 'checkmate') return fate === 'killed-after-checkmate';
  if (termination === 'resignation') return isSurrenderKingFate(fate);
  return fate === 'survives';
}
