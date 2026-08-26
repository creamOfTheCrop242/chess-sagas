import { z } from 'zod';
import { WOUND_CAUSE_TYPES } from '../wound-planning';
import { DEFEATED_KING_FATES } from '../../chess/models/story-ending';
import { SURRENDER_JUDGMENTS } from '../../chess/surrender-context';
import {
  AFTERMATH_FOCUSES,
  DESTROYED_SEAL_CONSEQUENCES,
  ENDING_GENRES,
  INTACT_SEAL_CONSEQUENCES,
  LATER_CHRONICLE_LENSES,
} from '../ending-contract';
export const battlefieldEnvironmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
});

export const surrenderContextSchema = z
  .object({
    judgment: z.enum(SURRENDER_JUDGMENTS),
    materialBalance: z.number(),
    legalMoveCount: z.number().int().nonnegative(),
    inCheck: z.boolean(),
    safeFromImmediateMateMoveCount: z.number().int().nonnegative(),
    allowedFates: z.array(z.enum(DEFEATED_KING_FATES)).min(1),
    rationale: z.string().min(1),
  })
  .nullable();

export const GAME_SHAPES = [
  'rapid-assault',
  'queen-hunt',
  'king-march',
  'fortress-war',
  'slow-collapse',
  'promotion-invasion',
  'mutual-destruction',
  'attritional-war',
  'counterattack',
  'tactical-ambush',
  'siege',
  'other',
] as const;

const turningPointSchema = z.object({
  startPly: z.number().int().positive(),
  endPly: z.number().int().positive(),
  importance: z.enum(['major', 'critical']),
  chessSummary: z.string().min(1),
  fantasyMeaning: z.string().min(1),
});

function buildNarrativeAnalysisSchema(pieceIdSchema: z.ZodType<string>) {
  const narrativeActSchema = z.object({
    title: z.string().min(1),
    startPly: z.number().int().positive(),
    endPly: z.number().int().positive(),
    purpose: z.string().min(1),
    emotionalTone: z.string().min(1),
    majorCharacters: z.array(pieceIdSchema),
  });

  const characterImportanceSchema = z.object({
    pieceId: pieceIdSchema,
    score: z.number().int().min(1).max(10),
    reason: z.string().min(1),
  });

  const characterArcSchema = z.object({
    pieceId: pieceIdSchema,
    role: z.string().min(1),
    introductionPly: z.number().int().positive(),
    keyMoments: z.array(z.number().int().positive()),
    endingPly: z.number().int().positive().nullable(),
    personalityTraits: z.array(z.string().min(1)),
    visualTraits: z.array(z.string().min(1)),
    narrativeFunction: z.string().min(1),
  });

  const relationshipPlanSchema = z.object({
    id: z.string().min(1),
    characterIds: z.array(pieceIdSchema).length(2),
    relationshipType: z.string().min(1),
    startingDynamic: z.string().min(1),
    developmentPlies: z.array(z.number().int().positive()).min(1),
    payoffPly: z.number().int().positive().nullable(),
    intendedChange: z.string().min(1),
  });

  const promotingPawnPlanSchema = z.object({
    pieceId: pieceIdSchema,
    damagedKingId: pieceIdSchema,
    promotionPly: z.number().int().positive(),
    setupPlies: z.array(z.number().int().positive()),
    ascensionSite: z.string().min(1),
    ascensionMeaning: z.string().min(1),
  });

  const foreshadowingPlanSchema = z.object({
    payoffPly: z.number().int().positive(),
    setupPlies: z.array(z.number().int().positive()),
    setupDescription: z.string().min(1),
    payoffDescription: z.string().min(1),
  });

  const woundPlanSchema = z.object({
    pieceId: pieceIdSchema,
    inflictedAtPly: z.number().int().positive(),
    woundCatalogId: z.string().min(1).nullable().default(null),
    injury: z.string().min(1),
    lastingEffects: z.array(z.string().min(1)).min(1),
    recoveryPly: z.number().int().positive().nullable(),
    causeType: z.enum(WOUND_CAUSE_TYPES),
    sourcePieceId: pieceIdSchema.nullable(),
  });

  const endingPlanSchema = z.object({
    winner: z.enum(['north', 'south', 'draw', 'undecided']),
    termination: z.enum([
      'checkmate',
      'resignation',
      'timeout',
      'draw',
      'unknown',
    ]),
    surrenderAttempt: z.boolean(),
    kingdomConsequence: z.string().min(1),
    defeatedKingFate: z.enum(DEFEATED_KING_FATES),
    finalImage: z.string().min(1),
    aftermathFocus: z.enum(AFTERMATH_FOCUSES),
    laterChronicleLens: z.enum(LATER_CHRONICLE_LENSES),
    endingGenre: z.enum(ENDING_GENRES),
    laterChronicleCliffhanger: z.boolean().default(false),
    darkEndingConsequence: z
      .enum([...DESTROYED_SEAL_CONSEQUENCES, ...INTACT_SEAL_CONSEQUENCES])
      .default('surviving-character-leading-an-uprising-against-the-victor'),
  });

  return z.object({
    battlefieldEnvironment: battlefieldEnvironmentSchema,
    surrenderContext: surrenderContextSchema,
    titleConcepts: z.array(z.string().min(1)).min(1),
    dominantThemes: z.array(z.string().min(1)).min(1),
    gameShape: z.enum(GAME_SHAPES),
    gameClassificationReason: z.string().min(1),
    majorTurningPoints: z.array(turningPointSchema),
    acts: z.array(narrativeActSchema).min(1),
    characterImportance: z.array(characterImportanceSchema),
    characterArcs: z.array(characterArcSchema),
    relationshipPlans: z.array(relationshipPlanSchema).max(4),
    promotingPawnPlans: z.array(promotingPawnPlanSchema),
    foreshadowing: z.array(foreshadowingPlanSchema),
    woundPlans: z.array(woundPlanSchema).default([]),
    endingPlan: endingPlanSchema,
    continuityConstraints: z.array(z.string().min(1)).min(1),
  });
}

export const narrativeAnalysisSchema = buildNarrativeAnalysisSchema(
  z.string().min(1),
);

export function createLedgerConstrainedNarrativeAnalysisSchema(
  pieceIds: string[],
) {
  const uniquePieceIds = [...new Set(pieceIds)];
  if (uniquePieceIds.length === 0) {
    throw new Error('Cannot constrain narrative analysis without piece IDs');
  }
  return buildNarrativeAnalysisSchema(
    z.enum(uniquePieceIds as [string, ...string[]]),
  );
}

export const woundPlanSchema =
  narrativeAnalysisSchema.shape.woundPlans.unwrap().element;

export type NarrativeAnalysis = z.infer<typeof narrativeAnalysisSchema>;
