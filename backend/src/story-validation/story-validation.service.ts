import {
  BadGatewayException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { GenerationPreparationService } from '../generation/generation-preparation.service';
import { narrativeAnalysisSchema } from '../narrative-analysis/models/narrative-analysis';
import { storyOutlineSchema } from '../story-outline/models/story-outline';
import { DeterministicStoryValidator } from './deterministic-story.validator';
import { storyValidationResultSchema } from './models/story-validation';
import {
  STORY_VALIDATION_PROVIDER,
  type StoryValidationProvider,
} from './story-validation.provider';
import { STORY_VALIDATION_PROMPT_VERSION } from './story-validation.prompt';
import {
  sceneBreakdownSchema,
  type SceneBreakdown,
} from '../scene-breakdown/models/scene-breakdown';
import { SceneBreakdownValidator } from '../scene-breakdown/scene-breakdown.validator';
import type { StoryValidationResult } from './models/story-validation';

@Injectable()
export class StoryValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preparation: GenerationPreparationService,
    @Inject(STORY_VALIDATION_PROVIDER)
    private readonly provider: StoryValidationProvider,
    private readonly deterministic: DeterministicStoryValidator,
    private readonly sceneValidator: SceneBreakdownValidator,
  ) {}

  async validate(gameId: string) {
    return this.preparation.runStageOnce(gameId, 'VALIDATION', () =>
      this.validateOnce(gameId),
    );
  }

  private async validateOnce(gameId: string) {
    const [prepared, analysisRun, outlineRun, storyRun] = await Promise.all([
      this.preparation.prepare(gameId),
      this.prisma.generationRun.findFirst({
        where: {
          gameId,
          currentStage: 'NARRATIVE_ANALYSIS',
          status: 'COMPLETED',
        },
        orderBy: { createdAt: 'desc' },
        include: { narrativeAnalysis: true },
      }),
      this.prisma.generationRun.findFirst({
        where: { gameId, currentStage: 'OUTLINE', status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        include: { storyOutline: true },
      }),
      this.prisma.generationRun.findFirst({
        where: { gameId, currentStage: 'STORY', status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        include: { generatedStory: true, sceneBreakdown: true },
      }),
    ]);
    if (!analysisRun?.narrativeAnalysis)
      throw new NotFoundException('A completed narrative analysis is required');
    if (!outlineRun?.storyOutline)
      throw new NotFoundException('A completed story outline is required');
    if (!storyRun?.generatedStory)
      throw new NotFoundException('A completed full story is required');
    if (!storyRun.sceneBreakdown)
      throw new NotFoundException('A structured full story is required');

    const run = await this.prisma.generationRun.create({
      data: {
        gameId,
        status: 'RUNNING',
        currentStage: 'VALIDATION',
        model: this.provider.model,
        promptVersion: STORY_VALIDATION_PROMPT_VERSION,
      },
    });
    try {
      const { ledger } = prepared;
      const outline = storyOutlineSchema.parse(outlineRun.storyOutline.data);
      const sourceBreakdown = sceneBreakdownSchema.parse(
        storyRun.sceneBreakdown.data,
      );
      const deterministicFindings = [
        ...this.deterministic.validate(
          storyRun.generatedStory.storyMarkdown,
          ledger,
        ),
        ...this.deterministic.validateScenePackage(
          sourceBreakdown.scenes.map((scene) => ({
            ply: scene.startPly,
            fantasyNarration: scene.fantasyNarration,
            characters: scene.characters,
            woundsInflicted: scene.woundsInflicted,
            woundReferences: scene.woundReferences,
          })),
          ledger,
          sourceBreakdown.wounds,
          outline.selectedRevengePayoffs,
        ).findings,
      ];
      const result = storyValidationResultSchema.parse(
        await this.provider.validate({
          ledger,
          narrativeAnalysis: narrativeAnalysisSchema.parse(
            analysisRun.narrativeAnalysis.data,
          ),
          outline,
          title: storyRun.generatedStory.title,
          structuredStory: sourceBreakdown,
          deterministicFindings,
          telemetry: {
            gameId,
            generationRunId: run.id,
            attempt: 1,
            repairMode: deterministicFindings.length ? 'full' : 'none',
          },
        }),
      );
      const findings = [
        ...deterministicFindings,
        ...result.findings.filter(
          (finding) =>
            !deterministicFindings.some(
              (existing) =>
                existing.type === finding.type &&
                existing.excerpt === finding.excerpt,
            ),
        ),
      ];
      const hasErrors = findings.some(
        (finding) => finding.severity === 'error',
      );
      const repairApplied = hasStoryValidationPatches(result);
      if (hasErrors && !repairApplied) {
        throw new BadGatewayException(
          'Validation found errors but OpenAI returned no structured patches',
        );
      }
      const repairedBreakdown = applyStoryValidationPatches(
        sourceBreakdown,
        result,
        (prose) => this.deterministic.repairProhibitedTerminology(prose),
      );
      this.sceneValidator.validate(repairedBreakdown, ledger);
      const repairedStoryMarkdown = assembleValidatedStoryMarkdown(
        repairedBreakdown,
        outline.acts.map((act) => act.title),
      );
      if (repairApplied) {
        const remainingFindings = [
          ...this.deterministic.validate(repairedStoryMarkdown, ledger),
          ...this.deterministic.validateScenePackage(
            repairedBreakdown.scenes.map((scene) => ({
              ply: scene.startPly,
              fantasyNarration: scene.fantasyNarration,
              characters: scene.characters,
              woundsInflicted: scene.woundsInflicted,
              woundReferences: scene.woundReferences,
            })),
            ledger,
            repairedBreakdown.wounds,
            outline.selectedRevengePayoffs,
          ).findings,
        ].filter((finding) => finding.severity === 'error');
        if (remainingFindings.length > 0) {
          throw new BadGatewayException(
            `Repaired story still has deterministic errors: ${remainingFindings
              .map((finding) => finding.message)
              .join('; ')}`,
          );
        }
      }
      const valid = !hasErrors || repairApplied;
      const findingsJson = JSON.parse(
        JSON.stringify(findings),
      ) as Prisma.InputJsonValue;
      const breakdownJson = JSON.parse(
        JSON.stringify(repairedBreakdown),
      ) as Prisma.InputJsonValue;

      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          error: null,
          storyValidation: {
            create: {
              sourceStoryId: storyRun.generatedStory.id,
              schemaVersion: 2,
              valid,
              findings: findingsJson,
              repairedStoryMarkdown: repairApplied
                ? repairedStoryMarkdown
                : null,
            },
          },
          sceneBreakdown: {
            create: { schemaVersion: 3, data: breakdownJson },
          },
        },
      });
      return this.prisma.generationRun.findUnique({
        where: { id: run.id },
        include: { storyValidation: true, sceneBreakdown: true },
      });
    } catch (error) {
      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          error:
            error instanceof Error ? error.message : 'Story validation failed',
        },
      });
      throw error;
    }
  }

  async findLatest(gameId: string) {
    const run = await this.prisma.generationRun.findFirst({
      where: {
        gameId,
        currentStage: 'VALIDATION',
        status: 'COMPLETED',
      },
      orderBy: { createdAt: 'desc' },
      include: { storyValidation: true },
    });
    if (!run) {
      throw new NotFoundException(
        `No completed validation exists for game ${gameId}`,
      );
    }
    return run;
  }
}

export function hasStoryValidationPatches(
  result: StoryValidationResult,
): boolean {
  return (
    result.scenePatches.length > 0 ||
    result.epiloguePatch !== null ||
    result.laterEpilogueHeadingPatch !== null ||
    result.laterEpiloguePatch !== null
  );
}

export function applyStoryValidationPatches(
  source: SceneBreakdown,
  result: StoryValidationResult,
  cleanProse: (prose: string) => string = (prose) => prose,
): SceneBreakdown {
  const knownPlies = new Set(source.scenes.map((scene) => scene.startPly));
  const patches = new Map<number, string>();
  for (const patch of result.scenePatches) {
    if (!knownPlies.has(patch.ply)) {
      throw new BadGatewayException(
        `Validation returned a patch for unknown ply ${patch.ply}`,
      );
    }
    if (patches.has(patch.ply)) {
      throw new BadGatewayException(
        `Validation returned duplicate patches for ply ${patch.ply}`,
      );
    }
    patches.set(patch.ply, cleanProse(patch.fantasyNarration));
  }

  return sceneBreakdownSchema.parse({
    ...source,
    scenes: source.scenes.map((scene) => ({
      ...scene,
      fantasyNarration: patches.get(scene.startPly) ?? scene.fantasyNarration,
    })),
    epilogue:
      result.epiloguePatch === null
        ? source.epilogue
        : cleanProse(result.epiloguePatch),
    laterEpilogueHeading:
      result.laterEpilogueHeadingPatch === null
        ? source.laterEpilogueHeading
        : cleanHeading(result.laterEpilogueHeadingPatch),
    laterEpilogue:
      result.laterEpiloguePatch === null
        ? source.laterEpilogue
        : cleanProse(result.laterEpiloguePatch),
  });
}

export function assembleValidatedStoryMarkdown(
  breakdown: SceneBreakdown,
  actTitles: string[],
): string {
  const sections: string[] = [];
  let currentAct = 0;
  for (const scene of breakdown.scenes) {
    if (scene.actNumber !== currentAct) {
      currentAct = scene.actNumber;
      const title = (actTitles[currentAct - 1] || `Act ${currentAct}`).replace(
        /\b[a-h][1-8]\b/gi,
        'battlefield',
      );
      sections.push(`## Act ${currentAct}: ${title}`);
    }
    sections.push(scene.fantasyNarration);
  }
  if (breakdown.epilogue) {
    sections.push('## Immediate Aftermath', breakdown.epilogue);
  }
  if (breakdown.laterEpilogue) {
    sections.push(
      `## ${breakdown.laterEpilogueHeading || 'The Later Chronicle'}`,
      breakdown.laterEpilogue,
    );
  }
  return sections.join('\n\n');
}

function cleanHeading(heading: string): string {
  return heading.replace(/^#{1,6}\s*/, '').trim();
}
