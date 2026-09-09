import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { GameLedger } from '../chess/models/game-ledger';
import { MYTHIC_ARMS, mythicArmForCommander } from '../chess/mythic-arms';
import {
  isSurrenderKingFate,
  kingDiesFromFate,
  sealFateForKingFate,
} from '../chess/models/story-ending';
import { PrismaService } from '../database/prisma.service';
import { GenerationPreparationService } from '../generation/generation-preparation.service';
import { narrativeAnalysisSchema } from '../narrative-analysis/models/narrative-analysis';
import {
  deathCatalogEntry,
  selectDeathCatalogEntry,
  type DeathCatalogId,
  type DeathEventKind,
} from '../narrative-analysis/death-catalog';
import {
  woundCatalogEntry,
  type WoundCatalogId,
} from '../narrative-analysis/wound-catalog';
import { NARRATIVE_ANALYSIS_PROMPT_VERSION } from '../narrative-analysis/narrative-analysis.prompt';
import { SceneBreakdownValidator } from '../scene-breakdown/scene-breakdown.validator';
import type { SceneBreakdown } from '../scene-breakdown/models/scene-breakdown';
import { storyOutlineSchema } from '../story-outline/models/story-outline';
import { buildRelationshipSceneGuide } from './relationship-scene-guide';
import { STORY_OUTLINE_PROMPT_VERSION } from '../story-outline/story-outline.prompt';
import { canonicalTitleKey } from '../story-outline/story-title';
import {
  DeterministicStoryValidator,
  type ScenePackageValidation,
} from '../story-validation/deterministic-story.validator';
import type { ValidationFinding } from '../story-validation/models/story-validation';
import {
  FULL_STORY_PROVIDER,
  type CaptureDirective,
  type CheckStrainDirective,
  type DeathBeatDirective,
  type EndingWorldState,
  type FortressOperatingDirective,
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

const WOUND_REPAIR_FINDING_TYPES = new Set<ValidationFinding['type']>([
  'invented-wound',
  'missing-wound',
  'wound-continuity',
]);

export function isWoundRepairFinding(
  finding: Pick<ValidationFinding, 'type'>,
): boolean {
  return WOUND_REPAIR_FINDING_TYPES.has(finding.type);
}

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
      const deathContracts = buildDeathContracts(ledger);
      const endingDeathContract = buildEndingDeathContract(
        ledger,
        narrativeAnalysis,
      );
      const checkStrainTimeline = buildCheckStrainTimeline(ledger);
      const woundTimeline = buildWoundTimeline(
        ledger,
        narrativeAnalysis,
        outline,
      );
      const woundStateByPly = buildWoundStateByPly(
        ledger.events.length,
        woundTimeline,
      );
      const fortressOperatingTimeline = buildFortressOperatingTimeline(
        ledger,
        woundTimeline,
        endingWorldState,
      );
      const storyPackage = generatedStoryPackageSchema.parse(
        await this.provider.generate({
          ledger,
          narrativeAnalysis,
          outline,
          characterRegistry: ledger.pieces,
          relationshipSceneGuide: buildRelationshipSceneGuide(
            ledger,
            narrativeAnalysis,
            outline,
          ),
          captureManifest,
          deathContracts,
          endingDeathContract,
          woundTimeline,
          woundStateByPly,
          checkStrainTimeline,
          fortressOperatingTimeline,
          endingWorldState,
          validationFeedback: validationFeedback?.trim().slice(0, 4_000),
          telemetry: {
            gameId,
            generationRunId: run.id,
            attempt: 1,
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
      const woundCatalogIdByKey = new Map(
        outline.woundBeats.map((wound) => [
          `${wound.pieceId}:${wound.inflictedAtPly}`,
          wound.woundCatalogId,
        ]),
      );
      storyPackage.wounds = storyPackage.wounds.map((wound) => ({
        ...wound,
        woundCatalogId:
          woundCatalogIdByKey.get(`${wound.pieceId}:${wound.inflictedAtPly}`) ??
          wound.woundCatalogId,
      }));
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
            returned.woundCatalogId !== expected.woundCatalogId ||
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
      storyPackage.scenes = normalizeStructuredCaptureMetadata(
        storyPackage.scenes,
        ledger,
      );
      const sceneNumbers = new Map<number, number>();
      let scenes = storyPackage.scenes.map((creativeScene) => {
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
          ...woundTimeline
            .filter((wound) => wound.inflictedAtPly === event.ply)
            .map((wound) => wound.pieceId),
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
          woundsInflicted: creativeScene.woundsInflicted,
          woundReferences: storyPackage.wounds
            .filter(
              (wound) =>
                characters.includes(wound.pieceId) &&
                wound.inflictedAtPly <= event.ply &&
                (wound.recoveryPly === null || event.ply < wound.recoveryPly),
            )
            .map((wound) => ({
              woundId: `wound:${wound.pieceId}:${wound.inflictedAtPly}`,
              ownerPieceId: wound.pieceId,
            })),
          promotions: event.isPromotion ? [event.pieceId] : [],
          visualPrompt: fantasyNarration,
          videoPrompt: fantasyNarration,
          estimatedDurationSeconds: Math.max(8, Math.ceil(wordCount / 2.5)),
          continuityNotes: [],
        };
      });
      // These are permissions derived from the timeline, not claims extracted
      // from prose. The name makes that distinction explicit for validators.
      const allowedWoundReferencesByPly = new Map(
        scenes.map((scene) => [scene.startPly, scene.woundReferences]),
      );
      const generatedSceneByPly = new Map(
        storyPackage.scenes.map((scene) => [scene.ply, scene]),
      );
      const validateStoryScenes = (candidateScenes = scenes) => {
        const input = candidateScenes.map((scene) => ({
          ply: scene.startPly,
          fantasyNarration: scene.fantasyNarration,
          characters: scene.characters,
          woundsInflicted:
            generatedSceneByPly.get(scene.startPly)?.woundsInflicted ?? [],
          woundReferences:
            allowedWoundReferencesByPly.get(scene.startPly) ?? [],
        }));
        return this.deterministic.validateScenePackage(
          input,
          ledger,
          storyPackage.wounds,
          outline.selectedRevengePayoffs,
        );
      };
      let sceneValidation = await this.adjudicateAmbiguousTimedFates(
        validateStoryScenes(),
        scenes,
        ledger,
        gameId,
        run.id,
        1,
      );
      const allSceneFindings = () =>
        [
          ...sceneValidation.terminologyFindings,
          ...sceneValidation.prematureAscensionFindings,
          ...sceneValidation.captureAttributionFindings,
          ...sceneValidation.checkStrainFindings,
          ...sceneValidation.revengePayoffFindings,
          ...sceneValidation.timedFateFindings.filter(
            (finding) => finding.severity === 'error',
          ),
          ...sceneValidation.checkmateDeathFindings,
          ...sceneValidation.fortressPowerFindings,
          ...sceneValidation.mythicArmFindings,
        ].filter((finding) => finding.ply !== null);

      const repairTargetedStoryFindings = async (attemptOffset = 0) => {
        for (let repairAttempt = 1; repairAttempt <= 2; repairAttempt += 1) {
          const findings = allSceneFindings();
          if (findings.length === 0) break;
          try {
            const targetPlies = [
              ...new Set(findings.map((finding) => finding.ply as number)),
            ];
            const contextPlies = new Set<number>();
            for (const ply of targetPlies) {
              if (ply > 1) contextPlies.add(ply - 1);
              if (ply < ledger.events.length) contextPlies.add(ply + 1);
            }
            targetPlies.forEach((ply) => contextPlies.delete(ply));
            const currentNarrationByPly = new Map(
              scenes.map((scene) => [scene.startPly, scene.fantasyNarration]),
            );
            const repairResult = await this.provider.repairStoryScenes({
              scenes: storyPackage.scenes
                .filter((scene) => targetPlies.includes(scene.ply))
                .map((scene) => ({
                  ...scene,
                  fantasyNarration:
                    currentNarrationByPly.get(scene.ply) ??
                    scene.fantasyNarration,
                  woundReferences:
                    allowedWoundReferencesByPly.get(scene.ply) ?? [],
                })),
              contextScenes: scenes
                .filter((scene) => contextPlies.has(scene.startPly))
                .map((scene) => ({
                  ply: scene.startPly,
                  fantasyNarration: scene.fantasyNarration,
                })),
              findings: findings.map((finding) => ({
                ply: finding.ply as number,
                pieceId: finding.pieceId,
                type: finding.type,
                message: finding.message,
                excerpt: finding.excerpt,
              })),
              captureManifest: captureManifest.filter((entry) =>
                targetPlies.includes(entry.ply),
              ),
              deathContracts: buildRepairDeathContracts(ledger, targetPlies),
              woundTimeline,
              characterRegistry: ledger.pieces,
              selectedRevengePayoffs: outline.selectedRevengePayoffs.filter(
                (payoff) => targetPlies.includes(payoff.payoffPly),
              ),
              checkStrainTimeline: checkStrainTimeline.filter((entry) =>
                targetPlies.includes(entry.ply),
              ),
              fortressOperatingTimeline,
              mythicArmContracts: buildMythicArmRepairContracts(
                ledger,
                targetPlies,
                storyPackage.scenes,
                findings,
              ),
              telemetry: {
                gameId,
                generationRunId: run.id,
                attempt: repairAttempt + attemptOffset,
                repairMode: 'partial',
              },
            });
            const repairedByPly = new Map(
              repairResult.scenes.map((scene) => [scene.ply, scene]),
            );
            if (
              repairedByPly.size !== targetPlies.length ||
              targetPlies.some((ply) => !repairedByPly.has(ply))
            ) {
              throw new Error(
                'Story scene repair returned incomplete ply coverage',
              );
            }
            scenes = scenes.map((scene) => {
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
                estimatedDurationSeconds: Math.max(
                  8,
                  Math.ceil(wordCount / 2.5),
                ),
              };
            });
            sceneValidation = await this.adjudicateAmbiguousTimedFates(
              validateStoryScenes(),
              scenes,
              ledger,
              gameId,
              run.id,
              repairAttempt + attemptOffset + 1,
            );
            this.logger.log(
              `Applied targeted story scene repair gameId=${gameId} runId=${run.id} attempt=${repairAttempt} plies=${targetPlies.join(',')}`,
            );
          } catch (error) {
            this.logger.warn(
              `Story scene repair failed gameId=${gameId} runId=${run.id} attempt=${repairAttempt}: ${error instanceof Error ? error.message : 'unknown repair error'}`,
            );
          }
        }
      };
      await repairTargetedStoryFindings();
      const checkmateFallback = applyMissingCheckmateDeathFallback(
        scenes,
        ledger,
        sceneValidation,
      );
      if (checkmateFallback.applied) {
        scenes = checkmateFallback.scenes;
        sceneValidation = await this.adjudicateAmbiguousTimedFates(
          validateStoryScenes(),
          scenes,
          ledger,
          gameId,
          run.id,
          4,
        );
        this.logger.log(
          `Applied deterministic checkmate death completion gameId=${gameId} runId=${run.id} ply=${checkmateFallback.ply}`,
        );
      }
      const {
        terminologyFindings,
        timedFateFindings,
        captureAttributionFindings,
        checkStrainFindings,
        revengePayoffFindings,
        prematureAscensionFindings,
        checkmateDeathFindings,
        fortressPowerFindings,
        mythicArmFindings,
      } = sceneValidation;
      if (terminologyFindings.length > 0) {
        throw new Error(
          `Generated story package contains reader-facing coordinate errors: ${terminologyFindings
            .map(
              (finding) =>
                `${finding.message}. Rejected prose: ${JSON.stringify(finding.excerpt)}`,
            )
            .join('; ')}`,
        );
      }
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
      if (checkmateDeathFindings.length > 0) {
        throw new Error(
          `Generated story package contains an incorrect checkmate death: ${checkmateDeathFindings
            .map(
              (finding) =>
                `${finding.message}. Rejected prose: ${JSON.stringify(finding.excerpt)}`,
            )
            .join('; ')}`,
        );
      }
      if (fortressPowerFindings.length > 0) {
        throw new Error(
          `Generated story package contains premature Fortress power loss: ${fortressPowerFindings
            .map(
              (finding) =>
                `${finding.message}. Rejected prose: ${JSON.stringify(finding.excerpt)}`,
            )
            .join('; ')}`,
        );
      }
      if (mythicArmFindings.length > 0) {
        throw new Error(
          `Generated story package contains Mythic Arm ownership errors: ${mythicArmFindings
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
      if (checkStrainFindings.length > 0) {
        throw new Error(
          `Generated story package assigns royal check strain to the wrong King: ${checkStrainFindings
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
      if (timedFateFindings.some((finding) => finding.severity === 'error')) {
        throw new Error(
          `Generated story package contains premature character deaths: ${timedFateFindings
            .map(
              (finding) =>
                `${finding.message} in scene at ply ${finding.ply}. Rejected prose: ${JSON.stringify(finding.excerpt)}`,
            )
            .join('; ')}`,
        );
      }
      const findTimedWounds = (candidateScenes: typeof scenes) =>
        validateStoryScenes(candidateScenes).woundFindings;
      let timedWoundFindings = findTimedWounds(scenes);
      const initialWoundErrors = timedWoundFindings.filter(
        (finding) => finding.severity === 'error',
      );
      const repairableWoundErrors = initialWoundErrors.filter(
        (finding) =>
          finding.excerpt !== null &&
          (finding.type === 'invented-wound' ||
            finding.type === 'wound-continuity'),
      );
      const structuralWoundErrors = initialWoundErrors.filter(
        (finding) => !repairableWoundErrors.includes(finding),
      );
      if (structuralWoundErrors.length > 0) {
        throw new Error(
          `Generated story package contains wound timeline errors: ${formatWoundFindings(structuralWoundErrors, 'Rejected prose')}`,
        );
      }
      const initialWoundWarnings = timedWoundFindings.filter(
        (finding) =>
          finding.severity === 'warning' && isWoundRepairFinding(finding),
      );
      const repairableWoundFindings = [
        ...repairableWoundErrors,
        ...initialWoundWarnings,
      ];
      const woundRepairContracts = buildRepairContracts(repairableWoundErrors);
      if (repairableWoundFindings.length > 0) {
        this.logger.warn(
          `Targeted wound scene repair requested gameId=${gameId} runId=${run.id}: ${formatWoundFindings(repairableWoundFindings, 'Rejected prose')}`,
        );
        try {
          const warningPlies = [
            ...new Set(
              repairableWoundFindings
                .map((finding) => finding.ply)
                .filter((ply): ply is number => ply !== null),
            ),
          ];
          let candidateScenes = scenes;
          let feedbackFindings = repairableWoundFindings;
          let repairedWoundFindings = timedWoundFindings;
          let repairComplete = false;
          for (let attempt = 1; attempt <= 2; attempt += 1) {
            const repairResult = await this.provider.repairWoundScenes({
              scenes: storyPackage.scenes
                .filter((scene) => warningPlies.includes(scene.ply))
                .map((scene) => {
                  const currentScene = candidateScenes.find(
                    (candidate) => candidate.startPly === scene.ply,
                  );
                  return {
                    ply: scene.ply,
                    fantasyNarration:
                      currentScene?.fantasyNarration ?? scene.fantasyNarration,
                    characters: currentScene?.characters ?? scene.characters,
                    woundsInflicted: scene.woundsInflicted,
                    woundReferences:
                      allowedWoundReferencesByPly.get(scene.ply) ?? [],
                  };
                }),
              warnings: feedbackFindings.map((finding) => ({
                ply: finding.ply ?? 0,
                pieceId: finding.pieceId,
                message: finding.message,
                excerpt: finding.excerpt,
              })),
              repairContracts: woundRepairContracts.map((contract) =>
                woundRepairContractDirective(contract, ledger),
              ),
              wounds: storyPackage.wounds,
              woundTimeline,
              captureManifest: captureManifest.filter((entry) =>
                warningPlies.includes(entry.ply),
              ),
              characterRegistry: ledger.pieces,
              telemetry: {
                gameId,
                generationRunId: run.id,
                attempt,
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
            candidateScenes = candidateScenes.map((scene) => {
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
                estimatedDurationSeconds: Math.max(
                  8,
                  Math.ceil(wordCount / 2.5),
                ),
              };
            });
            const repairedValidation = validateStoryScenes(candidateScenes);
            repairedWoundFindings = repairedValidation.woundFindings;
            const repairedDeterministicErrors =
              repairedValidation.findings.filter(
                (finding) =>
                  finding.severity === 'error' && isWoundRepairFinding(finding),
              );
            const unresolvedContracts = unresolvedRepairContracts(
              woundRepairContracts,
              repairedDeterministicErrors,
            );
            if (
              unresolvedContracts.length === 0 &&
              repairedDeterministicErrors.length === 0
            ) {
              repairComplete = true;
              break;
            }
            const details = formatWoundFindings(
              repairedDeterministicErrors,
              `Rejected repair attempt ${attempt} prose`,
            );
            this.logger.error(
              `Wound scene repair attempt ${attempt} validation failed gameId=${gameId} runId=${run.id}: ${details}`,
            );
            if (attempt === 2) {
              throw new Error(
                `Wound scene repair did not resolve its original contract(s): ${unresolvedContracts
                  .map((contract) => contract.key)
                  .join(', ')}. ${details}`,
              );
            }
            feedbackFindings = repairedDeterministicErrors;
          }
          if (!repairComplete) {
            throw new Error('Wound scene repair exhausted its attempts');
          }
          scenes = candidateScenes;
          timedWoundFindings = repairedWoundFindings;
          this.logger.log(
            `Applied targeted wound scene repair gameId=${gameId} runId=${run.id} plies=${warningPlies.join(',')}`,
          );
        } catch (error) {
          if (repairableWoundErrors.length > 0) {
            throw new Error(
              `Targeted wound scene repair could not resolve a blocking contradiction: ${error instanceof Error ? error.message : 'unknown repair error'}`,
            );
          }
          this.logger.warn(
            `Wound scene repair skipped gameId=${gameId} runId=${run.id}: ${error instanceof Error ? error.message : 'unknown repair error'}`,
          );
        }
      }
      // A wound-only repair is judged against wound contracts above. It may
      // still accidentally introduce a different contradiction (for example,
      // swapping two commanders' Mythic Arms). Re-run the complete validator
      // and hand those findings to the general targeted scene repair rather
      // than failing them inside the wound-repair path.
      sceneValidation = await this.adjudicateAmbiguousTimedFates(
        validateStoryScenes(),
        scenes,
        ledger,
        gameId,
        run.id,
        4,
      );
      if (allSceneFindings().length > 0) {
        await repairTargetedStoryFindings(2);
      }
      const unresolvedPostWoundFindings = allSceneFindings();
      if (unresolvedPostWoundFindings.length > 0) {
        throw new Error(
          `Targeted post-wound story repair could not produce a valid result: ${formatWoundFindings(unresolvedPostWoundFindings, 'Rejected prose')}`,
        );
      }
      const remainingWoundWarnings = timedWoundFindings.filter(
        (finding) => finding.severity === 'warning',
      );
      if (remainingWoundWarnings.length > 0) {
        this.logger.warn(
          `Story package wound prose warnings gameId=${gameId} runId=${run.id}: ${formatWoundFindings(remainingWoundWarnings, 'Prose')}`,
        );
      }
      let epilogue = this.cleanReaderFacingProse(storyPackage.epilogue, [
        ...pieceIds,
      ]);
      let laterEpilogueHeading = this.cleanReaderFacingProse(
        storyPackage.laterEpilogueHeading,
        [...pieceIds],
      );
      let laterEpilogue = this.cleanReaderFacingProse(
        storyPackage.laterEpilogue,
        [...pieceIds],
      );
      let defeatedKingDeathDescription =
        storyPackage.defeatedKingDeathDescription === null
          ? null
          : this.cleanReaderFacingProse(
              storyPackage.defeatedKingDeathDescription,
              [...pieceIds],
            );
      let actTitles = outline.acts.map((act) =>
        this.cleanReaderFacingProse(act.title, [...pieceIds]),
      );

      type ReaderFacingSection = {
        sectionId: string;
        sectionPurpose: string;
        text: string;
      };
      const readerFacingSections = (): ReaderFacingSection[] => [
        ...actTitles.map((text, index) => ({
          sectionId: `act-title-${index + 1}`,
          sectionPurpose: `heading for act ${index + 1}`,
          text,
        })),
        {
          sectionId: 'immediate-aftermath',
          sectionPurpose: 'Immediate Aftermath following the final battle beat',
          text: epilogue,
        },
        {
          sectionId: 'later-chronicles-heading',
          sectionPurpose: 'short heading for the Later Chronicles time jump',
          text: laterEpilogueHeading,
        },
        {
          sectionId: 'later-chronicles',
          sectionPurpose: 'Later Chronicles time-jump narrative',
          text: laterEpilogue,
        },
        ...(defeatedKingDeathDescription === null
          ? []
          : [
              {
                sectionId: 'defeated-king-death',
                sectionPurpose:
                  'concise canonical description of the defeated King death',
                text: defeatedKingDeathDescription,
              },
            ]),
      ];
      const validateReaderFacingSections = () =>
        readerFacingSections().flatMap((section) =>
          this.deterministic.validate(section.text, ledger).map((finding) => ({
            sectionId: section.sectionId,
            sectionPurpose: section.sectionPurpose,
            finding,
          })),
        );
      const applySectionRepairs = (repaired: Map<string, string>) => {
        actTitles = actTitles.map(
          (title, index) => repaired.get(`act-title-${index + 1}`) ?? title,
        );
        epilogue = repaired.get('immediate-aftermath') ?? epilogue;
        laterEpilogueHeading =
          repaired.get('later-chronicles-heading') ?? laterEpilogueHeading;
        laterEpilogue = repaired.get('later-chronicles') ?? laterEpilogue;
        if (defeatedKingDeathDescription !== null) {
          defeatedKingDeathDescription =
            repaired.get('defeated-king-death') ?? defeatedKingDeathDescription;
        }
      };

      let sectionFindings = validateReaderFacingSections();
      for (
        let repairAttempt = 1;
        repairAttempt <= 2 && sectionFindings.length > 0;
        repairAttempt += 1
      ) {
        const sectionIds = [
          ...new Set(sectionFindings.map(({ sectionId }) => sectionId)),
        ];
        const sectionById = new Map(
          readerFacingSections().map((section) => [section.sectionId, section]),
        );
        this.logger.warn(
          `Targeted story section repair requested gameId=${gameId} runId=${run.id} attempt=${repairAttempt}: ${formatSectionFindings(sectionFindings)}`,
        );
        const repairResult = await this.provider.repairStorySections({
          sections: sectionIds.map((sectionId) => {
            const section = sectionById.get(sectionId);
            if (!section) {
              throw new Error(`Unknown story section ${sectionId}`);
            }
            return section;
          }),
          findings: sectionFindings.map(({ sectionId, finding }) => ({
            sectionId,
            type: finding.type,
            message: finding.message,
            excerpt: finding.excerpt,
          })),
          characterRegistry: ledger.pieces,
          endingWorldState,
          telemetry: {
            gameId,
            generationRunId: run.id,
            attempt: repairAttempt,
            repairMode: 'partial',
          },
        });
        const repairedById = new Map<string, string>();
        for (const repair of repairResult.sections) {
          if (!sectionIds.includes(repair.sectionId)) {
            throw new Error(
              `Story section repair returned unknown section ${repair.sectionId}`,
            );
          }
          if (repairedById.has(repair.sectionId)) {
            throw new Error(
              `Story section repair returned duplicate section ${repair.sectionId}`,
            );
          }
          repairedById.set(
            repair.sectionId,
            this.cleanReaderFacingProse(repair.text, [...pieceIds]),
          );
        }
        if (
          repairedById.size !== sectionIds.length ||
          sectionIds.some((sectionId) => !repairedById.has(sectionId))
        ) {
          throw new Error('Story section repair returned incomplete coverage');
        }
        const repairedHeading = repairedById.get('later-chronicles-heading');
        if (repairedHeading && repairedHeading.length > 80) {
          throw new Error(
            'Story section repair returned an overlong Later Chronicles heading',
          );
        }
        applySectionRepairs(repairedById);
        sectionFindings = validateReaderFacingSections();
        this.logger.log(
          `Applied targeted story section repair gameId=${gameId} runId=${run.id} attempt=${repairAttempt} sections=${sectionIds.join(',')}`,
        );
      }
      if (sectionFindings.length > 0) {
        const details = formatSectionFindings(sectionFindings);
        this.logger.error(
          `Story section repair validation failed gameId=${gameId} runId=${run.id}: ${details}`,
        );
        throw new Error(
          `Targeted story section repair could not resolve deterministic errors: ${details}`,
        );
      }
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
          actTitles,
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
            .map(
              (finding) =>
                `${finding.message}. Rejected prose: ${JSON.stringify(finding.excerpt)}`,
            )
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
      if (isCorrectableStoryPackageError(message)) {
        throw new UnprocessableEntityException(
          `Targeted story repair could not produce a valid result: ${message}`,
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
    let cleaned = this.deterministic.repairProhibitedTerminology(prose);
    pieceIds.forEach((pieceId) => {
      cleaned = cleaned.replaceAll(pieceId, 'the warrior');
    });
    return cleaned;
  }

  private async adjudicateAmbiguousTimedFates(
    validation: ScenePackageValidation,
    scenes: Array<{ startPly: number; fantasyNarration: string }>,
    ledger: GameLedger,
    gameId: string,
    generationRunId: string,
    attempt: number,
  ): Promise<ScenePackageValidation> {
    const candidates = validation.timedFateFindings.filter(
      isAmbiguousTimedFateFinding,
    );
    if (candidates.length === 0) return validation;

    const sceneByPly = new Map(
      scenes.map((scene) => [scene.startPly, scene.fantasyNarration]),
    );
    try {
      const result = await this.provider.adjudicatePossiblePrematureDeaths({
        findings: candidates.map((finding, findingIndex) => {
          const piece = ledger.pieces.find(
            (candidate) => candidate.id === finding.pieceId,
          );
          return {
            findingIndex,
            ply: finding.ply as number,
            characterName:
              piece?.viewpointName ??
              piece?.operatorName ??
              piece?.characterName ??
              piece?.permanentName ??
              'Unknown character',
            expectedStatus:
              piece?.capturedAtPly === undefined
                ? ('survives-story' as const)
                : ('alive-until-later-capture' as const),
            capturedAtPly: piece?.capturedAtPly ?? null,
            flaggedExcerpt: finding.excerpt ?? '',
            sceneNarration: sceneByPly.get(finding.ply as number) ?? '',
          };
        }),
        telemetry: {
          gameId,
          generationRunId,
          attempt,
          repairMode: 'partial',
        },
      });
      const decisions = new Map(
        result.findings.map((finding) => [finding.findingIndex, finding]),
      );
      const cleared = new Set<ValidationFinding>();
      const confirmed = new Set<ValidationFinding>();
      candidates.forEach((finding, findingIndex) => {
        const decision = decisions.get(findingIndex);
        if (decision && !decision.contradiction) cleared.add(finding);
        if (decision?.contradiction) confirmed.add(finding);
      });
      if (cleared.size > 0) {
        this.logger.log(
          `Semantic death adjudication cleared ${cleared.size} ambiguous finding(s) gameId=${gameId} runId=${generationRunId}`,
        );
      }
      return {
        ...validation,
        timedFateFindings: validation.timedFateFindings
          .filter((finding) => !cleared.has(finding))
          .map((finding) =>
            confirmed.has(finding)
              ? { ...finding, severity: 'error' as const }
              : finding,
          ),
        findings: validation.findings
          .filter((finding) => !cleared.has(finding))
          .map((finding) =>
            confirmed.has(finding)
              ? { ...finding, severity: 'error' as const }
              : finding,
          ),
      };
    } catch (error) {
      this.logger.warn(
        `Semantic death adjudication failed; preserving deterministic findings gameId=${gameId} runId=${generationRunId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return validation;
    }
  }
}

export function buildMythicArmRepairContracts(
  ledger: GameLedger,
  targetPlies: number[],
  scenes: Array<{ ply: number; characters: string[] }>,
  findings: Array<{ ply: number | null; pieceId: string | null }>,
) {
  const targetPlySet = new Set(targetPlies);
  const relevantPieceIds = new Set<string>();
  for (const scene of scenes) {
    if (!targetPlySet.has(scene.ply)) continue;
    scene.characters.forEach((pieceId) => relevantPieceIds.add(pieceId));
  }
  for (const finding of findings) {
    if (
      finding.pieceId &&
      finding.ply !== null &&
      targetPlySet.has(finding.ply)
    ) {
      relevantPieceIds.add(finding.pieceId);
    }
  }

  return ledger.pieces
    .filter(
      (piece) =>
        piece.fantasyType === 'knight-commander' &&
        relevantPieceIds.has(piece.id),
    )
    .map((piece) => {
      const assignedArm = mythicArmForCommander(piece, ledger.initialFen);
      const applicablePlies = scenes
        .filter(
          (scene) =>
            targetPlySet.has(scene.ply) &&
            (scene.characters.includes(piece.id) ||
              findings.some(
                (finding) =>
                  finding.ply === scene.ply && finding.pieceId === piece.id,
              )),
        )
        .map((scene) => scene.ply);
      return {
        pieceId: piece.id,
        characterNames: [piece.permanentName, piece.characterName].filter(
          (name): name is string => Boolean(name),
        ),
        applicablePlies,
        assignedArm: {
          id: assignedArm.id,
          name: assignedArm.name,
          description: assignedArm.description,
          signatures: [...assignedArm.signatures],
        },
        forbiddenArms: MYTHIC_ARMS.filter(
          (arm) => arm.id !== assignedArm.id,
        ).map((arm) => ({
          id: arm.id,
          name: arm.name,
          signatures: [...arm.signatures],
        })),
      };
    })
    .filter((contract) => contract.applicablePlies.length > 0);
}

export function isAmbiguousTimedFateFinding(
  finding: ValidationFinding,
): boolean {
  if (
    finding.type !== 'invented-capture' &&
    finding.type !== 'survivor-killed'
  ) {
    return false;
  }
  if (!finding.excerpt) return false;
  // Pronoun references are candidates until their meaning is confirmed,
  // even though they contain explicit death vocabulary.
  if (finding.severity === 'warning') return true;
  return !/\b(?:dead|death|dies?|died|dying|slain|slew|killed|lifeless|corpse|remains|grave|funeral|beheaded|decapitated|last breath|final breath)\b/i.test(
    finding.excerpt,
  );
}

export function isCorrectableStoryPackageError(message: string): boolean {
  return [
    'Generated story package contains capture attribution errors:',
    'Generated story package omits verified revenge payoffs:',
    'Generated story package contains premature character deaths:',
    'Generated story package contains wound timeline errors:',
    'Generated story package contains deterministic errors:',
    'Generated story package contains reader-facing coordinate errors:',
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
    const catalog = woundCatalogEntry(
      analysisWound?.woundCatalogId ?? wound.woundCatalogId ?? '',
    );
    if (!catalog) {
      throw new Error(
        `Missing wound catalog contract for ${wound.pieceId} at ply ${wound.inflictedAtPly}`,
      );
    }
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
      woundCatalogId: catalog.id as WoundCatalogId,
      bodyArea: catalog.bodyArea,
      severity: catalog.severity,
      requiredEffects: catalog.effects,
      recoverability: catalog.recoverability,
      narrationGuidance: catalog.narrationGuidance,
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

export function buildFortressOperatingTimeline(
  ledger: GameLedger,
  woundTimeline: WoundTimelineDirective[],
  endingWorldState: EndingWorldState,
): FortressOperatingDirective[] {
  const finalPly = ledger.events.at(-1)?.ply ?? 1;
  const endingOutcomes = new Map(
    endingWorldState.survivingFortresses.map((outcome) => [
      outcome.pieceId,
      outcome.powerOutcome,
    ]),
  );

  return ledger.pieces
    .filter((piece) => piece.fantasyType === 'moving-fortress')
    .map((piece) => {
      const activeThrough = Math.min(piece.capturedAtPly ?? finalPly, finalPly);
      const stateIntervals: FortressOperatingDirective['stateIntervals'] = [];
      for (let ply = 1; ply <= activeThrough; ply += 1) {
        const state = woundTimeline.some(
          (wound) =>
            wound.pieceId === piece.id &&
            wound.inflictedAtPly <= ply &&
            wound.activeThroughPly >= ply,
        )
          ? ('damaged-but-mobile' as const)
          : ('operational' as const);
        const previous = stateIntervals.at(-1);
        if (previous?.state === state) {
          previous.endPly = ply;
        } else {
          stateIntervals.push({ startPly: ply, endPly: ply, state });
        }
      }
      const powerOutcome = endingOutcomes.get(piece.id);
      return {
        pieceId: piece.id,
        operatorName:
          piece.operatorName ?? piece.viewpointName ?? piece.permanentName,
        stateIntervals,
        afterBattleState:
          piece.capturedAtPly !== undefined
            ? ('destroyed-in-battle' as const)
            : powerOutcome === 'loses-seal-power'
              ? ('depowered-by-seal-loss' as const)
              : ('retains-seal-power' as const),
      };
    });
}

export function deriveSceneWoundReferences(
  scenes: Array<{ startPly: number; characters: string[] }>,
  wounds: GeneratedStoryPackage['wounds'],
): Array<{
  ply: number;
  woundReferences: Array<{ woundId: string; ownerPieceId: string }>;
}> {
  return scenes.map((scene) => ({
    ply: scene.startPly,
    woundReferences: wounds
      .filter(
        (wound) =>
          scene.characters.includes(wound.pieceId) &&
          wound.inflictedAtPly <= scene.startPly &&
          (wound.recoveryPly === null || scene.startPly < wound.recoveryPly),
      )
      .map((wound) => ({
        woundId: woundIdFor(wound.pieceId, wound.inflictedAtPly),
        ownerPieceId: wound.pieceId,
      })),
  }));
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

export function buildDeathContracts(ledger: GameLedger): DeathBeatDirective[] {
  const pieces = new Map(ledger.pieces.map((piece) => [piece.id, piece]));
  return ledger.events.map((event) => {
    const checkmatedKing = event.isCheckmate
      ? pieces.get(event.checkmateExplanation?.kingId ?? '')
      : undefined;
    const victim =
      checkmatedKing ??
      (event.capturedPieceId ? pieces.get(event.capturedPieceId) : undefined);
    const actor = victim ? pieces.get(event.pieceId) : undefined;
    const eventKind: DeathEventKind | null = checkmatedKing
      ? 'checkmate'
      : victim
        ? 'capture'
        : null;
    const catalog =
      victim && actor && eventKind
        ? selectDeathCatalogEntry(
            victim.fantasyType,
            eventKind,
            actor.fantasyType,
            [
              ledger.metadata.date ?? '',
              ledger.metadata.whitePlayer,
              ledger.metadata.blackPlayer,
              ledger.events.map((candidate) => candidate.san).join(' '),
              event.ply,
              actor.id,
              victim.id,
              eventKind,
            ].join('|'),
          )
        : null;
    return {
      ply: event.ply,
      authorizedVictimId: victim?.id ?? null,
      authorizedVictimNames: victim ? narrativeAliases(victim) : [],
      noOtherDeaths: true as const,
      deathCatalogId: (catalog?.id as DeathCatalogId | undefined) ?? null,
      eventKind,
      decisiveActorId: actor?.id ?? null,
      decisiveActorNames: actor ? narrativeAliases(actor) : [],
      method: catalog?.method ?? null,
      targetArea: catalog?.targetArea ?? null,
      narrationGuidance: catalog?.narrationGuidance ?? null,
      forbiddenClaims: catalog?.forbiddenClaims ?? [],
    };
  });
}

export function buildEndingDeathContract(
  ledger: GameLedger,
  analysis: ReturnType<typeof narrativeAnalysisSchema.parse>,
): DeathBeatDirective | null {
  if (
    ledger.metadata.termination !== 'resignation' ||
    analysis.endingPlan.defeatedKingFate !== 'executed-after-rejected-surrender'
  ) {
    return null;
  }
  const defeatedSide =
    ledger.metadata.result === '1-0'
      ? 'south'
      : ledger.metadata.result === '0-1'
        ? 'north'
        : null;
  const king = ledger.pieces.find(
    (piece) => piece.side === defeatedSide && piece.fantasyType === 'king',
  );
  const catalog = deathCatalogEntry('king-surrender-execution');
  if (!king || !catalog) {
    throw new Error('Cannot build rejected-surrender execution contract');
  }
  return {
    ply: ledger.events.at(-1)?.ply ?? 1,
    authorizedVictimId: king.id,
    authorizedVictimNames: narrativeAliases(king),
    noOtherDeaths: true,
    deathCatalogId: catalog.id as DeathCatalogId,
    eventKind: 'rejected-surrender',
    decisiveActorId: null,
    decisiveActorNames: [],
    method: catalog.method,
    targetArea: catalog.targetArea,
    narrationGuidance: catalog.narrationGuidance,
    forbiddenClaims: catalog.forbiddenClaims,
  };
}

export function normalizeStructuredCaptureMetadata<
  T extends {
    ply: number;
    captureActorId: string | null;
    captureVictimId: string | null;
    victimDies: boolean;
  },
>(scenes: T[], ledger: GameLedger): T[] {
  return scenes.map((scene) => {
    const event = ledger.events[scene.ply - 1];
    if (!event || event.ply !== scene.ply) {
      throw new Error(`Story package has no ledger event for ply ${scene.ply}`);
    }
    return {
      ...scene,
      captureActorId: event.isCapture ? event.pieceId : null,
      captureVictimId: event.capturedPieceId ?? null,
      victimDies: event.isCapture && Boolean(event.capturedPieceId),
    };
  });
}

function buildRepairDeathContracts(
  ledger: GameLedger,
  plies: number[],
): Array<
  DeathBeatDirective & {
    mustRemainAlive: Array<{ pieceId: string; names: string[] }>;
  }
> {
  const selected = new Set(plies);
  return buildDeathContracts(ledger)
    .filter((contract) => selected.has(contract.ply))
    .map((contract) => ({
      ...contract,
      mustRemainAlive: ledger.pieces
        .filter(
          (piece) =>
            piece.id !== contract.authorizedVictimId &&
            (piece.capturedAtPly === undefined ||
              piece.capturedAtPly > contract.ply),
        )
        .map((piece) => ({
          pieceId: piece.id,
          names: narrativeAliases(piece),
        })),
    }));
}

export function applyMissingCheckmateDeathFallback<
  T extends { startPly: number; fantasyNarration: string },
>(
  scenes: T[],
  ledger: GameLedger,
  validation: ScenePackageValidation,
): { scenes: T[]; applied: boolean; ply: number | null } {
  const checkmateEvent = ledger.events.find((event) => event.isCheckmate);
  if (!checkmateEvent) return { scenes, applied: false, ply: null };

  const missingDeath = validation.checkmateDeathFindings;
  const otherErrors = validation.findings.filter(
    (finding) =>
      finding.severity === 'error' && finding.type !== 'missing-checkmate',
  );
  if (
    missingDeath.length !== 1 ||
    otherErrors.length > 0 ||
    !missingDeath[0].message.includes('must die visibly')
  ) {
    return { scenes, applied: false, ply: null };
  }

  const actor = ledger.pieces.find(
    (piece) => piece.id === checkmateEvent.pieceId,
  );
  const king = ledger.pieces.find(
    (piece) => piece.id === checkmateEvent.checkmateExplanation?.kingId,
  );
  const scene = scenes.find(
    (candidate) => candidate.startPly === checkmateEvent.ply,
  );
  const contract = buildDeathContracts(ledger).find(
    (candidate) => candidate.ply === checkmateEvent.ply,
  );
  if (!actor || !king || !scene || !contract?.method) {
    return { scenes, applied: false, ply: null };
  }

  const sentence = deterministicCheckmateDeathSentence(
    actor,
    king,
    contract.method,
    ledger,
  );
  return {
    scenes: scenes.map((candidate) =>
      candidate.startPly === checkmateEvent.ply
        ? {
            ...candidate,
            fantasyNarration: `${candidate.fantasyNarration.trim()} ${sentence}`,
          }
        : candidate,
    ),
    applied: true,
    ply: checkmateEvent.ply,
  };
}

function deterministicCheckmateDeathSentence(
  actor: GameLedger['pieces'][number],
  king: GameLedger['pieces'][number],
  method: DeathBeatDirective['method'],
  ledger: GameLedger,
): string {
  const actorName = narrativeAliases(actor)[0] ?? actor.permanentName;
  const kingName = narrativeAliases(king)[0] ?? king.permanentName;

  if (method === 'fortress-ram') {
    return `${actorName} drove ${actor.permanentName}'s reinforced prow into ${kingName}, crushing his body against the stone; the impact killed him.`;
  }
  if (method === 'projectile' || method === 'fortress-round') {
    return `${actorName} fired through ${kingName}'s chest; the fatal shot killed him.`;
  }
  if (method === 'hostile-magic') {
    return `${actorName}'s final spell tore through ${kingName}'s body and killed him.`;
  }
  if (method === 'mythic-arm') {
    const arm = mythicArmForCommander(actor, ledger.initialFen);
    return `${actorName} struck ${kingName} with the ${arm.name}, inflicting the fatal wound that killed him.`;
  }
  if (method === 'blunt-force') {
    const weapon =
      actor.fantasyType === 'knight-commander'
        ? `the ${mythicArmForCommander(actor, ledger.initialFen).name}`
        : 'the final blow';
    return `${actorName} struck ${kingName}'s head with ${weapon}; the blow killed him.`;
  }
  if (method === 'penetration') {
    const weapon =
      actor.fantasyType === 'knight-commander'
        ? `the ${mythicArmForCommander(actor, ledger.initialFen).name}`
        : 'an established weapon';
    return `${actorName} drove ${weapon} through ${kingName}'s chest; the wound killed him.`;
  }
  return `${actorName}'s final attack inflicted a fatal wound on ${kingName} and killed him.`;
}

export function buildCheckStrainTimeline(
  ledger: GameLedger,
): CheckStrainDirective[] {
  const kingsBySide = new Map(
    ledger.pieces
      .filter((piece) => piece.fantasyType === 'king')
      .map((piece) => [piece.side, piece]),
  );
  const pieces = new Map(ledger.pieces.map((piece) => [piece.id, piece]));

  return ledger.events.flatMap((event) => {
    if (!event.isCheck) return [];
    const damagedSide = event.side === 'north' ? 'south' : 'north';
    const damagedKing = kingsBySide.get(damagedSide);
    const protectedKing = kingsBySide.get(event.side);
    const checkingPiece = pieces.get(event.pieceId);
    if (!damagedKing || !protectedKing || !checkingPiece) return [];
    return [
      {
        ply: event.ply,
        checkingPieceId: checkingPiece.id,
        checkingPieceNames: narrativeAliases(checkingPiece),
        damagedKingId: damagedKing.id,
        damagedKingNames: narrativeAliases(damagedKing),
        protectedKingId: protectedKing.id,
        protectedKingNames: narrativeAliases(protectedKing),
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
        `[${finding.type}] severity=${finding.severity} ply=${finding.ply ?? 'unknown'} pieceId=${finding.pieceId ?? 'unknown'}: ${finding.message}${
          finding.excerpt
            ? `. ${proseLabel}: ${JSON.stringify(finding.excerpt)}`
            : ''
        }`,
    )
    .join('; ');
}

type DeterministicRepairContract = {
  key: string;
  type: ValidationFinding['type'];
  ply: number | null;
  pieceId: string | null;
};

function buildRepairContracts(
  findings: ValidationFinding[],
): DeterministicRepairContract[] {
  return findings.map((finding) => ({
    key: `${finding.type}:${finding.ply ?? 'global'}:${finding.pieceId ?? 'none'}`,
    type: finding.type,
    ply: finding.ply,
    pieceId: finding.pieceId,
  }));
}

function unresolvedRepairContracts(
  contracts: DeterministicRepairContract[],
  findings: ValidationFinding[],
): DeterministicRepairContract[] {
  return contracts.filter((contract) =>
    findings.some(
      (finding) =>
        finding.type === contract.type &&
        finding.ply === contract.ply &&
        finding.pieceId === contract.pieceId,
    ),
  );
}

function woundRepairContractDirective(
  contract: DeterministicRepairContract,
  ledger: GameLedger,
): {
  key: string;
  ply: number;
  pieceId: string | null;
  characterName: string | null;
  requirement: string;
  forbiddenClaims: string[];
} {
  const piece = contract.pieceId
    ? ledger.pieces.find((candidate) => candidate.id === contract.pieceId)
    : undefined;
  const characterName = piece?.operatorName ?? piece?.permanentName ?? null;
  const subject = characterName ?? contract.pieceId ?? 'the cited character';
  if (contract.type === 'invented-wound') {
    return {
      key: contract.key,
      ply: contract.ply ?? 0,
      pieceId: contract.pieceId,
      characterName,
      requirement: `${subject} has no authorized new or active wound at this ply and must end the scene physically unharmed. If ${subject} is an embedded pilot, the pilot and every integrated Fortress component must remain intact and operational.`,
      forbiddenClaims: [
        'bodily injury, pain, bleeding, impairment, or lasting physical strain',
        'broken, cracked, ruptured, buckled, disabled, jammed, or failing integrated Fortress components',
        'damage inherited from the scene target, captured victim, terrain, or nearby structures',
      ],
    };
  }
  return {
    key: contract.key,
    ply: contract.ply ?? 0,
    pieceId: contract.pieceId,
    characterName,
    requirement: `Remove the cited premature wound state from ${subject}. Preserve only wound references that the supplied wound timeline marks active at this ply.`,
    forbiddenClaims: [
      'mentioning the planned wound before its infliction ply',
      'transferring another character’s wound to this character',
      'rephrasing the same prohibited wound with a synonym',
    ],
  };
}

function formatSectionFindings(
  findings: Array<{
    sectionId: string;
    sectionPurpose: string;
    finding: ValidationFinding;
  }>,
): string {
  return findings
    .map(
      ({ sectionId, sectionPurpose, finding }) =>
        `section=${sectionId} (${sectionPurpose}) [${finding.type}] severity=${finding.severity}: ${finding.message}${
          finding.excerpt
            ? `. Rejected prose: ${JSON.stringify(finding.excerpt)}`
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
