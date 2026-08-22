import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { GenerationPreparationService } from '../generation/generation-preparation.service';
import {
  NARRATIVE_ANALYSIS_PROVIDER,
  type NarrativeAnalysisProvider,
} from './llm-provider';
import { narrativeAnalysisSchema } from './models/narrative-analysis';
import { NARRATIVE_ANALYSIS_PROMPT_VERSION } from './narrative-analysis.prompt';
import { NarrativeAnalysisValidator } from './narrative-analysis.validator';
import { buildEndingContract } from './ending-contract';
import type { NarrativeAnalysis } from './models/narrative-analysis';
import { sealFateForKingFate } from '../chess/models/story-ending';
import type { GameLedger } from '../chess/models/game-ledger';
import { sanitizeWoundStatusText } from './wound-status-sanitizer';

@Injectable()
export class NarrativeAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preparation: GenerationPreparationService,
    @Inject(NARRATIVE_ANALYSIS_PROVIDER)
    private readonly provider: NarrativeAnalysisProvider,
    private readonly validator: NarrativeAnalysisValidator,
  ) {}

  async generate(gameId: string) {
    return this.preparation.runStageOnce(gameId, 'NARRATIVE_ANALYSIS', () =>
      this.generateOnce(gameId),
    );
  }

  private async generateOnce(gameId: string) {
    const prepared = await this.preparation.prepare(gameId);

    const run = await this.prisma.generationRun.create({
      data: {
        gameId,
        status: 'RUNNING',
        currentStage: 'NARRATIVE_ANALYSIS',
        model: this.provider.model,
        promptVersion: NARRATIVE_ANALYSIS_PROMPT_VERSION,
      },
    });

    try {
      const {
        ledger,
        requiredWoundEvents,
        battlefieldEnvironment,
        surrenderContext,
      } = prepared;
      const endingContract = buildEndingContract(ledger);
      const generatedAnalysis = narrativeAnalysisSchema.parse(
        await this.provider.analyze({
          ledger,
          requiredWoundEvents,
          battlefieldEnvironment,
          surrenderContext,
          endingContract,
          telemetry: {
            gameId,
            generationRunId: run.id,
            attempt: 1,
            repairMode: 'none',
          },
        }),
      );
      const analysis = sanitizeWoundStatusText(
        normalizeRelationshipChronology(
          normalizeSharedAscensionSites(
            normalizePromotionDamageOwnership(
              normalizeDeterministicAnalysisFacts(
                generatedAnalysis,
                battlefieldEnvironment,
                surrenderContext,
                endingContract,
              ),
              ledger,
            ),
            ledger,
          ),
        ),
        ledger,
      );
      this.validator.validate(analysis, ledger);
      const data = JSON.parse(
        JSON.stringify(analysis),
      ) as Prisma.InputJsonValue;

      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          error: null,
          narrativeAnalysis: {
            create: {
              schemaVersion: 1,
              data,
            },
          },
        },
      });

      return this.prisma.generationRun.findUnique({
        where: { id: run.id },
        include: { narrativeAnalysis: true },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Analysis generation failed';
      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          error: message,
          completedAt: new Date(),
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
        currentStage: 'NARRATIVE_ANALYSIS',
        status: 'COMPLETED',
        promptVersion: NARRATIVE_ANALYSIS_PROMPT_VERSION,
      },
      orderBy: { createdAt: 'desc' },
      include: { narrativeAnalysis: true },
    });
    if (!run) {
      throw new NotFoundException(
        `No completed narrative analysis exists for game ${gameId}`,
      );
    }
    return run;
  }
}

export function normalizeRelationshipChronology(
  analysis: NarrativeAnalysis,
): NarrativeAnalysis {
  return {
    ...analysis,
    relationshipPlans: analysis.relationshipPlans.map((relationship) => {
      const developmentPlies = [...new Set(relationship.developmentPlies)]
        .sort((left, right) => left - right)
        .filter(
          (ply) =>
            relationship.payoffPly === null || ply < relationship.payoffPly,
        );

      if (developmentPlies.length > 0 || relationship.payoffPly === null) {
        return { ...relationship, developmentPlies };
      }

      return {
        ...relationship,
        developmentPlies: [relationship.payoffPly],
        payoffPly: null,
      };
    }),
  };
}

export function normalizePromotionDamageOwnership(
  analysis: NarrativeAnalysis,
  ledger: GameLedger,
): NarrativeAnalysis {
  const pieceSides = new Map(
    ledger.pieces.map((piece) => [piece.id, piece.side] as const),
  );
  const kingBySide = new Map(
    ledger.pieces
      .filter((piece) => piece.chessType === 'k')
      .map((piece) => [piece.side, piece.id] as const),
  );

  return {
    ...analysis,
    promotingPawnPlans: analysis.promotingPawnPlans.map((plan) => {
      const promotingSide = pieceSides.get(plan.pieceId);
      if (!promotingSide) return plan;
      const opposingSide = promotingSide === 'north' ? 'south' : 'north';
      const damagedKingId = kingBySide.get(opposingSide);
      return damagedKingId ? { ...plan, damagedKingId } : plan;
    }),
  };
}

export function normalizeSharedAscensionSites(
  analysis: NarrativeAnalysis,
  ledger: GameLedger,
): NarrativeAnalysis {
  const pieceSides = new Map(
    ledger.pieces.map((piece) => [piece.id, piece.side] as const),
  );
  const siteByInvadedKingdom = new Map<'north' | 'south', string>();
  const orderedPlans = [...analysis.promotingPawnPlans].sort(
    (left, right) => left.promotionPly - right.promotionPly,
  );

  for (const plan of orderedPlans) {
    const promotingSide = pieceSides.get(plan.pieceId);
    if (!promotingSide) continue;
    const invadedKingdom = promotingSide === 'north' ? 'south' : 'north';
    if (!siteByInvadedKingdom.has(invadedKingdom)) {
      siteByInvadedKingdom.set(
        invadedKingdom,
        normalizeAscensionSiteTerritory(plan.ascensionSite, invadedKingdom),
      );
    }
  }

  return {
    ...analysis,
    promotingPawnPlans: analysis.promotingPawnPlans.map((plan) => {
      const promotingSide = pieceSides.get(plan.pieceId);
      if (!promotingSide) return plan;
      const invadedKingdom = promotingSide === 'north' ? 'south' : 'north';
      return {
        ...plan,
        ascensionSite:
          siteByInvadedKingdom.get(invadedKingdom) ?? plan.ascensionSite,
      };
    }),
  };
}

export function normalizeAscensionSiteTerritory(
  ascensionSite: string,
  invadedKingdom: 'north' | 'south',
): string {
  const territory =
    invadedKingdom === 'south'
      ? {
          kingdom: 'Dark Kingdom',
          direction: 'southern',
          wrongKingdom: /\b(?:Light|North(?:ern)?) Kingdom\b/gi,
          wrongExtreme: /\bnorthernmost\b/gi,
          wrongDirection:
            /\b(?:far\s+)?north(?:ern)?\s+(edge|border|frontier|reaches)\b/gi,
          correctTerritory:
            /\b(?:Dark|South(?:ern)?) Kingdom\b|\b(?:far\s+)?south(?:ern)?\s+(?:edge|border|frontier|reaches)\b/i,
        }
      : {
          kingdom: 'Light Kingdom',
          direction: 'northern',
          wrongKingdom: /\b(?:Dark|South(?:ern)?) Kingdom\b/gi,
          wrongExtreme: /\bsouthernmost\b/gi,
          wrongDirection:
            /\b(?:far\s+)?south(?:ern)?\s+(edge|border|frontier|reaches)\b/gi,
          correctTerritory:
            /\b(?:Light|North(?:ern)?) Kingdom\b|\b(?:far\s+)?north(?:ern)?\s+(?:edge|border|frontier|reaches)\b/i,
        };

  const corrected = ascensionSite
    .trim()
    .replace(territory.wrongKingdom, territory.kingdom)
    .replace(
      territory.wrongExtreme,
      territory.direction === 'southern' ? 'southernmost' : 'northernmost',
    )
    .replace(
      territory.wrongDirection,
      (_match, boundary: string) => `far ${territory.direction} ${boundary}`,
    );

  if (territory.correctTerritory.test(corrected)) return corrected;

  const site = corrected.replace(/[.,;:\s]+$/u, '');
  return `${site}, at the ${territory.kingdom}'s far ${territory.direction} edge`;
}

function normalizeDeterministicAnalysisFacts(
  analysis: NarrativeAnalysis,
  battlefieldEnvironment: NarrativeAnalysis['battlefieldEnvironment'],
  surrenderContext: NarrativeAnalysis['surrenderContext'],
  endingContract: ReturnType<typeof buildEndingContract>,
): NarrativeAnalysis {
  const defeatedKingFate =
    endingContract.termination === 'checkmate'
      ? 'killed-after-checkmate'
      : endingContract.termination === 'resignation'
        ? analysis.endingPlan.defeatedKingFate
        : 'survives';

  return narrativeAnalysisSchema.parse({
    ...analysis,
    battlefieldEnvironment,
    surrenderContext,
    endingPlan: {
      ...analysis.endingPlan,
      winner: endingContract.winner,
      termination: endingContract.termination,
      surrenderAttempt: endingContract.termination === 'resignation',
      defeatedKingFate,
      aftermathFocus: endingContract.creativeDirection.aftermathFocus,
      laterChronicleLens: endingContract.creativeDirection.laterChronicleLens,
      endingGenre: endingContract.creativeDirection.endingGenre,
      laterChronicleCliffhanger:
        endingContract.creativeDirection.laterChronicleCliffhanger,
      darkEndingConsequence:
        sealFateForKingFate(defeatedKingFate) === 'destroyed'
          ? endingContract.creativeDirection.destroyedSealConsequence
          : endingContract.creativeDirection.intactSealConsequence,
    },
  });
}
