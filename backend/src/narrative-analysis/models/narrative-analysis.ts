import { z } from 'zod';
import { DEFEATED_KING_FATES } from '../../chess/models/story-ending';
import { SURRENDER_JUDGMENTS } from '../../chess/surrender-context';
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

const narrativeActSchema = z.object({
  title: z.string().min(1),
  startPly: z.number().int().positive(),
  endPly: z.number().int().positive(),
  purpose: z.string().min(1),
  emotionalTone: z.string().min(1),
  majorCharacters: z.array(z.string().min(1)),
});

const characterImportanceSchema = z.object({
  pieceId: z.string().min(1),
  score: z.number().int().min(1).max(10),
  reason: z.string().min(1),
});

const characterArcSchema = z.object({
  pieceId: z.string().min(1),
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
  characterIds: z.array(z.string().min(1)).length(2),
  relationshipType: z.string().min(1),
  startingDynamic: z.string().min(1),
  developmentPlies: z.array(z.number().int().positive()).min(1),
  payoffPly: z.number().int().positive().nullable(),
  intendedChange: z.string().min(1),
});

const promotingPawnPlanSchema = z.object({
  pieceId: z.string().min(1),
  promotionPly: z.number().int().positive(),
  setupPlies: z.array(z.number().int().positive()),
  ascensionMeaning: z.string().min(1),
});

const foreshadowingPlanSchema = z.object({
  payoffPly: z.number().int().positive(),
  setupPlies: z.array(z.number().int().positive()),
  setupDescription: z.string().min(1),
  payoffDescription: z.string().min(1),
});

export const woundPlanSchema = z.object({
  pieceId: z.string().min(1),
  inflictedAtPly: z.number().int().positive(),
  injury: z.string().min(1),
  lastingEffects: z.array(z.string().min(1)).min(1),
  recoveryPly: z.number().int().positive().nullable(),
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
});

export const narrativeAnalysisSchema = z.object({
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
  relationshipPlans: z.array(relationshipPlanSchema).min(2).max(4),
  promotingPawnPlans: z.array(promotingPawnPlanSchema),
  foreshadowing: z.array(foreshadowingPlanSchema),
  woundPlans: z.array(woundPlanSchema).default([]),
  endingPlan: endingPlanSchema,
  continuityConstraints: z.array(z.string().min(1)).min(1),
});

export type NarrativeAnalysis = z.infer<typeof narrativeAnalysisSchema>;
