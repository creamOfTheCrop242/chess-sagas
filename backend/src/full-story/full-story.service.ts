import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { GameLedger } from '../chess/models/game-ledger';
import {
  isSurrenderKingFate,
  kingDiesFromFate,
  sealFateForKingFate,
} from '../chess/models/story-ending';
import { PrismaService } from '../database/prisma.service';
import { GenerationPreparationService } from '../generation/generation-preparation.service';
import { narrativeAnalysisSchema } from '../narrative-analysis/models/narrative-analysis';
import { NARRATIVE_ANALYSIS_PROMPT_VERSION } from '../narrative-analysis/narrative-analysis.prompt';
import { SceneBreakdownValidator } from '../scene-breakdown/scene-breakdown.validator';
import type { SceneBreakdown } from '../scene-breakdown/models/scene-breakdown';
import { storyOutlineSchema } from '../story-outline/models/story-outline';
import { STORY_OUTLINE_PROMPT_VERSION } from '../story-outline/story-outline.prompt';
import { canonicalTitleKey } from '../story-outline/story-title';
import { DeterministicStoryValidator } from '../story-validation/deterministic-story.validator';
import type { ValidationFinding } from '../story-validation/models/story-validation';
import {
  FULL_STORY_PROVIDER,
  type CaptureDirective,
  type EndingWorldState,
  type FullStoryRequest,
  type FullStoryProvider,
  type WoundTimelineDirective,
} from './full-story.provider';
import { FULL_STORY_PROMPT_VERSION } from './full-story.prompt';
import { FullStoryValidator } from './full-story.validator';
import {
  generatedStoryPackageSchema,
  type GeneratedStoryDraft,
  type GeneratedStoryPackage,
} from './models/generated-story';

type CompletedStoryRun = Prisma.GenerationRunGetPayload<{
  include: { generatedStory: true; sceneBreakdown: true };
}>;

@Injectable()
export class FullStoryService {
  private readonly logger = new Logger(FullStoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly preparation: GenerationPreparationService,
    @Inject(FULL_STORY_PROVIDER)
    private readonly provider: FullStoryProvider,
    private readonly validator: FullStoryValidator,
    private readonly sceneValidator: SceneBreakdownValidator,
    private readonly deterministic: DeterministicStoryValidator,
  ) {}

  async generate(
    gameId: string,
    validationFeedback?: string,
  ): Promise<CompletedStoryRun> {
    return this.preparation.runStageOnce(gameId, 'STORY', () =>
      this.generateOnce(gameId, validationFeedback),
    );
  }

  private async generateOnce(
    gameId: string,
    validationFeedback?: string,
    correctionAttempt = 0,
  ): Promise<CompletedStoryRun> {
    const [prepared, analysisRun, outlineRun] = await Promise.all([
      this.preparation.prepare(gameId),
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
      const { ledger } = prepared;
      const narrativeAnalysis = narrativeAnalysisSchema.parse(
        analysisRun.narrativeAnalysis.data,
      );
      const outline = storyOutlineSchema.parse(outlineRun.storyOutline.data);
      const endingWorldState = buildEndingWorldState(ledger, narrativeAnalysis);
      const captureManifest = buildCaptureManifest(ledger);
      const woundTimeline = buildWoundTimeline(
        ledger,
        narrativeAnalysis,
        outline,
      );
      const woundStateByPly = buildWoundStateByPly(
        ledger.events.length,
        woundTimeline,
      );
      const storyPackage = generatedStoryPackageSchema.parse(
        await this.provider.generate({
          ledger,
          narrativeAnalysis,
          outline,
          characterRegistry: ledger.pieces,
          captureManifest,
          woundTimeline,
          woundStateByPly,
          endingWorldState,
          validationFeedback: validationFeedback?.trim().slice(0, 4_000),
          telemetry: {
            gameId,
            generationRunId: run.id,
            attempt: correctionAttempt + 1,
            repairMode: validationFeedback ? 'full' : 'none',
          },
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
      if (
        JSON.stringify(storyPackage.survivingFortressOutcomes) !==
        JSON.stringify(endingWorldState.survivingFortresses)
      ) {
        throw new Error(
          'Story package surviving Fortress outcomes must match the ending world state',
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
      let scenes = storyPackage.scenes.map((creativeScene) => {
        const event = ledger.events[creativeScene.ply - 1];
        if (!event || event.ply !== creativeScene.ply) {
          throw new Error(
            `Story package has no ledger event for ply ${creativeScene.ply}`,
          );
        }
        const expectedCaptureActorId = event.isCapture ? event.pieceId : null;
        const expectedCaptureVictimId = event.capturedPieceId ?? null;
        const expectedVictimDies =
          event.isCapture && Boolean(event.capturedPieceId);
        if (
          creativeScene.captureActorId !== expectedCaptureActorId ||
          creativeScene.captureVictimId !== expectedCaptureVictimId ||
          creativeScene.victimDies !== expectedVictimDies
        ) {
          throw new Error(
            `Story package has incorrect structured capture metadata at ply ${event.ply}: expected actor=${expectedCaptureActorId ?? 'null'}, victim=${expectedCaptureVictimId ?? 'null'}, victimDies=${expectedVictimDies}`,
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
          captureActorId: event.isCapture ? event.pieceId : null,
          captureVictimId: event.capturedPieceId ?? null,
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
      const revengePayoffFindings = this.deterministic.validateRevengePayoffs(
        scenes.map((scene) => ({
          ply: scene.startPly,
          fantasyNarration: scene.fantasyNarration,
        })),
        ledger,
        outline.selectedRevengePayoffs,
      );
      const prematureAscensionFindings =
        this.deterministic.validatePrematureAscensionReveals(
          scenes.map((scene) => ({
            ply: scene.startPly,
            fantasyNarration: scene.fantasyNarration,
          })),
          ledger,
        );
      if (prematureAscensionFindings.length > 0) {
        throw new Error(
          `Generated story package reveals the promotion artifact prematurely: ${prematureAscensionFindings
            .map(
              (finding) =>
                `${finding.message}. Rejected prose: ${JSON.stringify(finding.excerpt)}`,
            )
            .join('; ')}`,
        );
      }
      if (captureAttributionFindings.length > 0) {
        throw new Error(
          `Generated story package contains capture attribution errors: ${captureAttributionFindings
            .map(
              (finding) =>
                `${finding.message}. Rejected prose: ${JSON.stringify(finding.excerpt)}`,
            )
            .join('; ')}`,
        );
      }
      if (revengePayoffFindings.length > 0) {
        throw new Error(
          `Generated story package omits verified revenge payoffs: ${revengePayoffFindings
            .map(
              (finding) =>
                `${finding.message}. Rejected prose: ${JSON.stringify(finding.excerpt)}`,
            )
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
      const findTimedWounds = (candidateScenes: typeof scenes) => [
        ...this.deterministic.validateStructuredWoundReferences(
          storyPackage.scenes.map((scene) => ({
            ply: scene.ply,
            characters: scene.characters,
            woundReferences: scene.woundReferences,
          })),
          storyPackage.wounds,
        ),
        ...this.deterministic.validateTimedWounds(
          candidateScenes.map((scene, index) => ({
            ply: scene.startPly,
            fantasyNarration: scene.fantasyNarration,
            characters: scene.characters,
            woundsInflicted: storyPackage.scenes[index]?.woundsInflicted ?? [],
            woundReferences: storyPackage.scenes[index]?.woundReferences ?? [],
          })),
          storyPackage.wounds,
          ledger,
        ),
        ...this.deterministic.validateUnplannedInjuries(
          candidateScenes.map((scene) => ({
            ply: scene.startPly,
            fantasyNarration: scene.fantasyNarration,
            characters: scene.characters,
          })),
          storyPackage.wounds,
          ledger,
        ),
        ...this.deterministic.validateWoundOwnershipTransfers(
          candidateScenes.map((scene) => ({
            ply: scene.startPly,
            fantasyNarration: scene.fantasyNarration,
            characters: scene.characters,
          })),
          storyPackage.wounds,
          ledger,
        ),
      ];
      let timedWoundFindings = findTimedWounds(scenes);
      const initialWoundErrors = timedWoundFindings.filter(
        (finding) => finding.severity === 'error',
      );
      if (initialWoundErrors.length > 0) {
        throw new Error(
          `Generated story package contains wound timeline errors: ${formatWoundFindings(initialWoundErrors, 'Rejected prose')}`,
        );
      }
      const initialWoundWarnings = timedWoundFindings.filter(
        (finding) => finding.severity === 'warning',
      );
      if (initialWoundWarnings.length > 0) {
        try {
          const warningPlies = [
            ...new Set(
              initialWoundWarnings
                .map((finding) => finding.ply)
                .filter((ply): ply is number => ply !== null),
            ),
          ];
          const repairResult = await this.provider.repairWoundScenes({
            scenes: storyPackage.scenes
              .filter((scene) => warningPlies.includes(scene.ply))
              .map((scene) => ({
                ply: scene.ply,
                fantasyNarration: scene.fantasyNarration,
                characters: scene.characters,
                woundsInflicted: scene.woundsInflicted,
                woundReferences: scene.woundReferences,
              })),
            warnings: initialWoundWarnings.map((finding) => ({
              ply: finding.ply ?? 0,
              pieceId: finding.pieceId,
              message: finding.message,
              excerpt: finding.excerpt,
            })),
            wounds: storyPackage.wounds,
            woundTimeline,
            captureManifest: captureManifest.filter((entry) =>
              warningPlies.includes(entry.ply),
            ),
            characterRegistry: ledger.pieces,
            telemetry: {
              gameId,
              generationRunId: run.id,
              attempt: correctionAttempt + 1,
              repairMode: 'partial',
            },
          });
          const repairedByPly = new Map(
            repairResult.scenes.map((scene) => [scene.ply, scene]),
          );
          if (
            repairedByPly.size !== warningPlies.length ||
            warningPlies.some((ply) => !repairedByPly.has(ply))
          ) {
            throw new Error(
              'Wound scene repair returned incomplete ply coverage',
            );
          }
          const candidateScenes = scenes.map((scene) => {
            const repair = repairedByPly.get(scene.startPly);
            if (!repair) return scene;
            const fantasyNarration = this.cleanReaderFacingProse(
              repair.fantasyNarration,
              [...pieceIds],
            );
            const wordCount = fantasyNarration.trim().split(/\s+/).length;
            return {
              ...scene,
              fantasyNarration,
              visualPrompt: fantasyNarration,
              videoPrompt: fantasyNarration,
              estimatedDurationSeconds: Math.max(8, Math.ceil(wordCount / 2.5)),
            };
          });
          const repairedCaptureErrors =
            this.deterministic.validateCaptureAttribution(
              candidateScenes.map((scene) => ({
                ply: scene.startPly,
                fantasyNarration: scene.fantasyNarration,
              })),
              ledger,
            );
          const repairedRevengeErrors =
            this.deterministic.validateRevengePayoffs(
              candidateScenes.map((scene) => ({
                ply: scene.startPly,
                fantasyNarration: scene.fantasyNarration,
              })),
              ledger,
              outline.selectedRevengePayoffs,
            );
          const repairedFateErrors =
            this.deterministic.validateTimedCharacterFates(
              candidateScenes.map((scene) => ({
                ply: scene.startPly,
                fantasyNarration: scene.fantasyNarration,
              })),
              ledger,
            );
          const repairedAscensionErrors =
            this.deterministic.validatePrematureAscensionReveals(
              candidateScenes.map((scene) => ({
                ply: scene.startPly,
                fantasyNarration: scene.fantasyNarration,
              })),
              ledger,
            );
          const repairedWoundFindings = findTimedWounds(candidateScenes);
          if (
            repairedCaptureErrors.length > 0 ||
            repairedRevengeErrors.length > 0 ||
            repairedFateErrors.length > 0 ||
            repairedAscensionErrors.length > 0 ||
            repairedWoundFindings.some(
              (finding) => finding.severity === 'error',
            )
          ) {
            throw new Error(
              'Wound scene repair introduced a deterministic contradiction',
            );
          }
          scenes = candidateScenes;
          timedWoundFindings = repairedWoundFindings;
          this.logger.log(
            `Applied targeted wound scene repair gameId=${gameId} runId=${run.id} plies=${warningPlies.join(',')}`,
          );
        } catch (error) {
          this.logger.warn(
            `Wound scene repair skipped gameId=${gameId} runId=${run.id}: ${error instanceof Error ? error.message : 'unknown repair error'}`,
          );
        }
      }
      const remainingWoundWarnings = timedWoundFindings.filter(
        (finding) => finding.severity === 'warning',
      );
      if (remainingWoundWarnings.length > 0) {
        this.logger.warn(
          `Story package wound prose warnings gameId=${gameId} runId=${run.id}: ${formatWoundFindings(remainingWoundWarnings, 'Prose')}`,
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
        survivingFortressOutcomes: storyPackage.survivingFortressOutcomes,
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
              titleKey: canonicalTitleKey(story.title),
              storyMarkdown: story.storyMarkdown,
            },
          },
          sceneBreakdown: {
            create: {
              schemaVersion: 2,
              data: breakdownData,
            },
          },
          saga: {
            create: {
              game: { connect: { id: gameId } },
              visibility: 'PUBLIC',
              storyVersion: FULL_STORY_PROMPT_VERSION,
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
              schemaVersion: 3,
              valid: true,
              findings: [],
              repairedStoryMarkdown: null,
            },
          },
          sceneBreakdown: {
            create: {
              schemaVersion: 3,
              data: breakdownData,
            },
          },
        },
      });
      return completedRun;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Story generation failed';
      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          error: message,
        },
      });
      if (correctionAttempt === 0 && isCorrectableStoryPackageError(message)) {
        return this.generateOnce(
          gameId,
          buildStoryCorrectionFeedback(message),
          correctionAttempt + 1,
        );
      }
      if (correctionAttempt > 0 && isCorrectableStoryPackageError(message)) {
        throw new UnprocessableEntityException(
          `Story correction retry failed: ${message}`,
        );
      }
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

export function isCorrectableStoryPackageError(message: string): boolean {
  return [
    'Generated story package contains capture attribution errors:',
    'Generated story package omits verified revenge payoffs:',
    'Generated story package contains premature character deaths:',
    'Generated story package contains wound timeline errors:',
    'Generated story package contains deterministic errors:',
    'Story package wound ledger must match the validated outline',
    'Story package has incorrect structured capture metadata at ply ',
    'Story package surviving Fortress outcomes must match the ending world state',
  ].some((prefix) => message.startsWith(prefix));
}

export function buildEndingWorldState(
  ledger: GameLedger,
  analysis: ReturnType<typeof narrativeAnalysisSchema.parse>,
): EndingWorldState {
  const defeatedSide =
    ledger.metadata.result === '1-0'
      ? 'south'
      : ledger.metadata.result === '0-1'
        ? 'north'
        : null;
  const defeatedSealFate = sealFateForKingFate(
    analysis.endingPlan.defeatedKingFate,
  );
  const survivingFortresses = ledger.pieces
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
        defeatedSide === piece.side && defeatedSealFate === 'destroyed'
          ? ('loses-seal-power' as const)
          : ('retains-seal-power' as const),
    }));

  return {
    termination: ledger.metadata.termination,
    defeatedSide,
    defeatedSealFate,
    surrenderContext: analysis.surrenderContext,
    survivingFortresses,
  };
}

export function buildStoryCorrectionFeedback(message: string): string {
  return [
    message,
    'This is the single targeted correction attempt.',
    'For every cited capture, use the exact actor and victim stated in the error: the actor kills the victim, never the reverse.',
    'For every cited revenge payoff, explicitly name the fallen ally identified in the error and make the avenger connect the current capture to that specific witnessed death. Preserve the actual current capture actor and victim; the fallen ally is the emotional reason for the capture, not its victim.',
    'Re-audit the captureManifest entry for every capture scene. Each requiredOutcome is authoritative even when nearby dialogue or resistance makes the victim prominent.',
    'For wounds, obey woundTimeline as an exact temporal permission table. Before prohibitedBeforePly ends, remove the cited injury, its anatomical damage, pain, impairment, and lasting effects from that character. General danger may remain, but it must not state or imply that the future wound already exists.',
    'For the aftermath, copy endingWorldState exactly. Never apply a destroyed Seal or entombment outcome to a Fortress marked retains-seal-power.',
    'Replace the rejected sentence while preserving all correct scenes, relationships, wounds, deaths, and story depth.',
    'Audit every other capture against the ledger before returning the complete corrected package.',
  ]
    .join(' ')
    .slice(0, 4_000);
}

export function buildWoundTimeline(
  ledger: GameLedger,
  analysis: ReturnType<typeof narrativeAnalysisSchema.parse>,
  outline: ReturnType<typeof storyOutlineSchema.parse>,
): WoundTimelineDirective[] {
  const pieces = new Map(ledger.pieces.map((piece) => [piece.id, piece]));
  const analysisWounds = new Map(
    analysis.woundPlans.map((wound) => [
      `${wound.pieceId}:${wound.inflictedAtPly}`,
      wound,
    ]),
  );
  const finalPly = ledger.events.at(-1)?.ply ?? 1;

  return outline.woundBeats.map((wound) => {
    const piece = pieces.get(wound.pieceId);
    const analysisWound = analysisWounds.get(
      `${wound.pieceId}:${wound.inflictedAtPly}`,
    );
    return {
      woundId: woundIdFor(wound.pieceId, wound.inflictedAtPly),
      pieceId: wound.pieceId,
      characterNames: piece ? narrativeAliases(piece) : [],
      injury: wound.injury,
      lastingEffects: analysisWound?.lastingEffects ?? [],
      prohibitedBeforePly: Math.max(0, wound.inflictedAtPly - 1),
      inflictedAtPly: wound.inflictedAtPly,
      activeThroughPly:
        wound.recoveryPly === null
          ? finalPly
          : Math.max(wound.inflictedAtPly, wound.recoveryPly - 1),
      recoveryPly: wound.recoveryPly,
      causeType: analysisWound?.causeType ?? wound.causeType,
      sourcePieceId: analysisWound?.sourcePieceId ?? wound.sourcePieceId,
      sourceNames:
        analysisWound?.sourcePieceId && pieces.get(analysisWound.sourcePieceId)
          ? narrativeAliases(pieces.get(analysisWound.sourcePieceId)!)
          : [],
    };
  });
}

export function buildWoundStateByPly(
  finalPly: number,
  woundTimeline: WoundTimelineDirective[],
): FullStoryRequest['woundStateByPly'] {
  return Array.from({ length: finalPly }, (_, index) => index + 1)
    .map((ply) => ({
      ply,
      newlyInflictedWoundIds: woundTimeline
        .filter((wound) => wound.inflictedAtPly === ply)
        .map((wound) => wound.woundId),
      activeWoundIds: woundTimeline
        .filter(
          (wound) =>
            wound.inflictedAtPly <= ply && wound.activeThroughPly >= ply,
        )
        .map((wound) => wound.woundId),
    }))
    .filter(
      (state) =>
        state.newlyInflictedWoundIds.length > 0 ||
        state.activeWoundIds.length > 0,
    );
}

function woundIdFor(pieceId: string, inflictedAtPly: number): string {
  return `wound:${pieceId}:${inflictedAtPly}`;
}

export function buildCaptureManifest(ledger: GameLedger): CaptureDirective[] {
  const pieces = new Map(ledger.pieces.map((piece) => [piece.id, piece]));
  return ledger.events.flatMap((event) => {
    if (!event.isCapture || !event.capturedPieceId) return [];
    const actor = pieces.get(event.pieceId);
    const victim = pieces.get(event.capturedPieceId);
    if (!actor || !victim) return [];
    const actorNames = narrativeAliases(actor);
    const victimNames = narrativeAliases(victim);
    return [
      {
        ply: event.ply,
        actorId: actor.id,
        actorNames,
        victimId: victim.id,
        victimNames,
        requiredOutcome: `${actorNames[0]} kills ${victimNames[0]}; ${victimNames[0]} must not kill ${actorNames[0]}.`,
      },
    ];
  });
}

function narrativeAliases(piece: GameLedger['pieces'][number]): string[] {
  return [
    piece.viewpointName,
    piece.operatorName,
    piece.characterName,
    piece.permanentName,
  ].filter(
    (name, index, all): name is string =>
      Boolean(name?.trim()) && all.indexOf(name) === index,
  );
}

function formatWoundFindings(
  findings: ValidationFinding[],
  proseLabel: string,
): string {
  return findings
    .map(
      (finding) =>
        `${finding.message}${
          finding.excerpt
            ? `. ${proseLabel}: ${JSON.stringify(finding.excerpt)}`
            : ''
        }`,
    )
    .join('; ');
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
