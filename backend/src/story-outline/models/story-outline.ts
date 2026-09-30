import { z } from 'zod';
import { battlefieldEnvironmentSchema } from '../../narrative-analysis/models/narrative-analysis';
import { WOUND_CAUSE_TYPES } from '../../narrative-analysis/wound-planning';
import { WOUND_BODY_AREAS } from '../../narrative-analysis/wound-catalog';

const outlineSceneSchema = z.object({
  sceneNumber: z.number().int().positive(),
  title: z.string().min(1),
  startPly: z.number().int().positive(),
  endPly: z.number().int().positive(),
  purpose: z.string().min(1),
  emotionalBeat: z.string().min(1),
  characters: z.array(z.string().min(1)),
  requiredEventPlies: z.array(z.number().int().positive()),
  continuityNotes: z.array(z.string().min(1)),
});

const outlineActSchema = z.object({
  actNumber: z.number().int().positive(),
  title: z.string().min(1),
  startPly: z.number().int().positive(),
  endPly: z.number().int().positive(),
  purpose: z.string().min(1),
  scenes: z.array(outlineSceneSchema).min(1),
});

const setupPayoffSchema = z.object({
  id: z.string().min(1),
  setupPlies: z.array(z.number().int().positive()).min(1),
  payoffPly: z.number().int().positive(),
  setup: z.string().min(1),
  payoff: z.string().min(1),
});

const relationshipBeatSchema = z.object({
  relationshipId: z.string().min(1),
  characterIds: z.array(z.string().min(1)).length(2),
  beatPlies: z.array(z.number().int().positive()).min(1),
  progression: z.string().min(1),
  payoff: z.string().min(1),
});

const endingBeatSchema = z.object({
  ply: z.number().int().positive(),
  beat: z.string().min(1),
});

const characterThreadsSchema = z
  .array(
    z.object({
      pieceId: z.string().min(1),
      personalWant: z.string().min(1),
      personalStake: z.string().min(1),
      initialBehavior: z.string().min(1),
      moments: z
        .array(
          z.object({
            ply: z.number().int().positive(),
            choiceOrReaction: z.string().min(1),
            changeFromEarlier: z.string().min(1),
            respondsToPly: z.number().int().positive().nullable().optional(),
          }),
        )
        .max(4),
      endingConnection: z.string().min(1),
      endingSetupPly: z.number().int().positive().nullable().optional(),
    }),
  )
  .max(3);

const endingActionSchema = z.object({
  viewpointPieceId: z.string(),
  objective: z.string(),
  action: z.string(),
  causeAndResult: z.string(),
  irreversibleCost: z.string(),
  finalPositions: z.array(
    z.object({ pieceId: z.string(), positionAndCondition: z.string() }),
  ),
});

export const endingActionPlanSchema = z.object({
  aftermath: endingActionSchema,
  laterChronicle: endingActionSchema,
});

const woundBeatSchema = z.object({
  pieceId: z.string().min(1),
  inflictedAtPly: z.number().int().positive(),
  woundCatalogId: z.string().min(1).nullable().default(null),
  injurySite: z.enum(WOUND_BODY_AREAS).nullable().optional(),
  injury: z.string().min(1),
  continuityPlies: z.array(z.number().int().positive()),
  recoveryPly: z.number().int().positive().nullable(),
  causeType: z.enum(WOUND_CAUSE_TYPES),
  sourcePieceId: z.string().min(1).nullable(),
});

const selectedRevengePayoffSchema = z.object({
  deathPly: z.number().int().positive(),
  payoffPly: z.number().int().positive(),
});

export const storyOutlineSchema = z.object({
  battlefieldEnvironment: battlefieldEnvironmentSchema,
  selectedTitle: z.string().min(1),
  theme: z.string().min(1),
  acts: z.array(outlineActSchema).min(1),
  setupPayoffs: z.array(setupPayoffSchema),
  relationshipBeats: z.array(relationshipBeatSchema).max(4),
  selectedRevengePayoffs: z
    .array(selectedRevengePayoffSchema)
    .max(3)
    .default([]),
  woundBeats: z.array(woundBeatSchema).default([]),
  endingSequence: z.array(endingBeatSchema).min(1),
  // Older saved outlines have no action plan. This is writing guidance, not
  // another semantic validation gate or a source of truth over the ledger.
  endingActionPlan: endingActionPlanSchema.nullable().optional(),
  characterThreads: characterThreadsSchema.nullable().optional(),
  proseConstraints: z.array(z.string().min(1)).min(1),
});

// Structured outputs require every property: null is the explicit fallback.
export const storyOutlineGenerationSchema = storyOutlineSchema.extend({
  endingActionPlan: endingActionPlanSchema.nullable(),
  characterThreads: z
    .array(
      characterThreadsSchema.element.extend({
        endingSetupPly: z.number().int().positive().nullable(),
        moments: z
          .array(
            characterThreadsSchema.element.shape.moments.element.extend({
              respondsToPly: z.number().int().positive().nullable(),
            }),
          )
          .max(4),
      }),
    )
    .max(3)
    .nullable(),
});

export type StoryOutline = z.infer<typeof storyOutlineSchema>;
