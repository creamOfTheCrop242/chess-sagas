import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { GameLedger } from '../chess/models/game-ledger';
import { normalizePawnViewpoints } from '../chess/piece-identity.service';
import { PrismaService } from '../database/prisma.service';
import { NARRATIVE_ANALYSIS_PROMPT_VERSION } from '../narrative-analysis/narrative-analysis.prompt';
import {
  narrativeAnalysisSchema,
  type NarrativeAnalysis,
} from '../narrative-analysis/models/narrative-analysis';
import { storyOutlineSchema, type StoryOutline } from './models/story-outline';
import { STORY_OUTLINE_PROMPT_VERSION } from './story-outline.prompt';
import {
  STORY_OUTLINE_PROVIDER,
  type StoryOutlineProvider,
} from './story-outline.provider';
import { StoryOutlineValidator } from './story-outline.validator';

@Injectable()
export class StoryOutlineService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORY_OUTLINE_PROVIDER)
    private readonly provider: StoryOutlineProvider,
    private readonly validator: StoryOutlineValidator,
  ) {}

  async generate(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, ledger: { select: { data: true } } },
    });
    if (!game?.ledger) {
      throw new NotFoundException(`Game ${gameId} or its ledger was not found`);
    }
    const analysisRun = await this.prisma.generationRun.findFirst({
      where: {
        gameId,
        currentStage: 'NARRATIVE_ANALYSIS',
        status: 'COMPLETED',
        promptVersion: NARRATIVE_ANALYSIS_PROMPT_VERSION,
      },
      orderBy: { createdAt: 'desc' },
      include: { narrativeAnalysis: true },
    });
    if (!analysisRun?.narrativeAnalysis) {
      throw new NotFoundException(
        `Generate a completed narrative analysis for game ${gameId} first`,
      );
    }

    const run = await this.prisma.generationRun.create({
      data: {
        gameId,
        status: 'RUNNING',
        currentStage: 'OUTLINE',
        model: this.provider.model,
        promptVersion: STORY_OUTLINE_PROMPT_VERSION,
      },
    });

    try {
      const ledger = normalizePawnViewpoints(
        game.ledger.data as unknown as GameLedger,
      );
      const narrativeAnalysis: NarrativeAnalysis =
        narrativeAnalysisSchema.parse(analysisRun.narrativeAnalysis.data);
      let outline: StoryOutline | undefined;
      let validationFeedback: string | undefined;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const candidate = normalizeStoryOutlineRelationshipScenes(
          normalizeStoryOutlineCharacters(
            normalizeStoryOutlineRequiredEvents(
              normalizeStoryOutlineEndingSequence(
                normalizeStoryOutlineSetupPayoffs(
                  normalizeStoryOutlineNumbering(
                    storyOutlineSchema.parse(
                      await this.provider.generate({
                        ledger,
                        narrativeAnalysis,
                        characterRegistry: ledger.pieces,
                        validationFeedback,
                      }),
                    ),
                  ),
                  ledger,
                ),
                ledger,
              ),
              ledger,
            ),
            ledger,
          ),
          narrativeAnalysis,
        );
        try {
          this.validator.validate(candidate, ledger, narrativeAnalysis);
          outline = candidate;
          break;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Outline validation failed';
          if (
            attempt === 0 &&
            (message.includes('Invalid setup/payoff relationship') ||
              message.includes('Ending sequence must include the final ply') ||
              message.includes('Relationship'))
          ) {
            validationFeedback = [
              message,
              `The ledger final ply is ${ledger.events.length}.`,
              `Rejected setupPayoffs: ${JSON.stringify(candidate.setupPayoffs)}.`,
              `Rejected relationshipBeats: ${JSON.stringify(candidate.relationshipBeats)}.`,
              'Rebuild each cited relationship with at least one real setup ply strictly before its payoff. Preserve meaningful narrative distance between setup and payoff.',
            ].join(' ');
            continue;
          }
          throw error;
        }
      }
      if (!outline) {
        throw new Error('Outline generation exhausted its validation retry');
      }
      const data = JSON.parse(JSON.stringify(outline)) as Prisma.InputJsonValue;

      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          error: null,
          storyOutline: { create: { schemaVersion: 1, data } },
        },
      });
      return this.prisma.generationRun.findUnique({
        where: { id: run.id },
        include: { storyOutline: true },
      });
    } catch (error) {
      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          error:
            error instanceof Error
              ? error.message
              : 'Outline generation failed',
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
        currentStage: 'OUTLINE',
        status: 'COMPLETED',
        promptVersion: STORY_OUTLINE_PROMPT_VERSION,
      },
      orderBy: { createdAt: 'desc' },
      include: { storyOutline: true },
    });
    if (!run) {
      throw new NotFoundException(
        `No completed story outline exists for game ${gameId}`,
      );
    }
    return run;
  }
}

export function normalizeStoryOutlineRelationshipScenes(
  outline: StoryOutline,
  analysis: NarrativeAnalysis,
): StoryOutline {
  const relationshipCharactersByPly = new Map<number, Set<string>>();
  const plannedRelationships = new Map(
    (analysis.relationshipPlans ?? []).map((relationship) => [
      relationship.id,
      relationship,
    ]),
  );
  for (const relationship of outline.relationshipBeats) {
    const planned = plannedRelationships.get(relationship.relationshipId);
    if (!planned) continue;
    for (const ply of relationship.beatPlies) {
      const characters =
        relationshipCharactersByPly.get(ply) ?? new Set<string>();
      planned.characterIds.forEach((pieceId) => characters.add(pieceId));
      relationshipCharactersByPly.set(ply, characters);
    }
  }
  return {
    ...outline,
    acts: outline.acts.map((act) => ({
      ...act,
      scenes: act.scenes.map((scene) => ({
        ...scene,
        characters: [
          ...scene.characters,
          ...[...relationshipCharactersByPly.entries()]
            .filter(([ply]) => ply >= scene.startPly && ply <= scene.endPly)
            .flatMap(([, characters]) => [...characters]),
        ].filter((pieceId, index, all) => all.indexOf(pieceId) === index),
      })),
    })),
  };
}

export function normalizeStoryOutlineNumbering(
  outline: StoryOutline,
): StoryOutline {
  return {
    ...outline,
    acts: outline.acts.map((act, actIndex) => ({
      ...act,
      actNumber: actIndex + 1,
      scenes: act.scenes.map((scene, sceneIndex) => ({
        ...scene,
        sceneNumber: sceneIndex + 1,
      })),
    })),
  };
}

export function normalizeStoryOutlineRequiredEvents(
  outline: StoryOutline,
  ledger: GameLedger,
): StoryOutline {
  const ledgerPlies = new Set(ledger.events.map((event) => event.ply));
  const modelSelectedPlies = outline.acts.flatMap((act) =>
    act.scenes.flatMap((scene) => scene.requiredEventPlies),
  );
  const significantPlies = ledger.events
    .filter(
      (event) =>
        event.isCapture || event.isCheck || event.isCastle || event.isPromotion,
    )
    .map((event) => event.ply);
  const requiredPlies = new Set(
    [...modelSelectedPlies, ...significantPlies].filter((ply) =>
      ledgerPlies.has(ply),
    ),
  );

  return {
    ...outline,
    acts: outline.acts.map((act) => ({
      ...act,
      scenes: act.scenes.map((scene) => ({
        ...scene,
        requiredEventPlies: [...requiredPlies]
          .filter((ply) => ply >= scene.startPly && ply <= scene.endPly)
          .sort((left, right) => left - right),
      })),
    })),
  };
}

export function normalizeStoryOutlineSetupPayoffs(
  outline: StoryOutline,
  ledger: GameLedger,
): StoryOutline {
  const finalPly = ledger.events.length;
  return {
    ...outline,
    setupPayoffs: outline.setupPayoffs.flatMap((relationship) => {
      const payoffPly = Math.min(relationship.payoffPly, finalPly);
      const setupPlies = [
        ...new Set(
          relationship.setupPlies.filter((ply) => ply >= 1 && ply < payoffPly),
        ),
      ].sort((left, right) => left - right);

      if (setupPlies.length) {
        return [{ ...relationship, setupPlies, payoffPly }];
      }
      return [{ ...relationship, payoffPly }];
    }),
  };
}

export function normalizeStoryOutlineEndingSequence(
  outline: StoryOutline,
  ledger: GameLedger,
): StoryOutline {
  const finalPly = ledger.events.length;
  const normalized = outline.endingSequence
    .map((endingBeat) => ({
      ...endingBeat,
      ply: Math.min(endingBeat.ply, finalPly),
    }))
    .filter((endingBeat) => endingBeat.ply >= 1)
    .sort((left, right) => left.ply - right.ply);
  if (!normalized.some((endingBeat) => endingBeat.ply === finalPly)) {
    const finalBeat = normalized.at(-1);
    if (finalBeat) {
      normalized.push({ ...finalBeat, ply: finalPly });
    }
  }

  return {
    ...outline,
    endingSequence: normalized.filter(
      (endingBeat, index, all) =>
        all.findIndex((candidate) => candidate.ply === endingBeat.ply) ===
        index,
    ),
  };
}

export function normalizeStoryOutlineCharacters(
  outline: StoryOutline,
  ledger: GameLedger,
): StoryOutline {
  const validPieceIds = new Set(ledger.pieces.map((piece) => piece.id));

  return {
    ...outline,
    acts: outline.acts.map((act) => ({
      ...act,
      scenes: act.scenes.map((scene) => {
        const eventCharacters = ledger.events
          .filter(
            (event) => event.ply >= scene.startPly && event.ply <= scene.endPly,
          )
          .flatMap((event) => [
            event.pieceId,
            ...(event.capturedPieceId ? [event.capturedPieceId] : []),
          ]);

        return {
          ...scene,
          characters: [
            ...new Set(
              [...scene.characters, ...eventCharacters].filter((pieceId) =>
                validPieceIds.has(pieceId),
              ),
            ),
          ],
        };
      }),
    })),
  };
}
