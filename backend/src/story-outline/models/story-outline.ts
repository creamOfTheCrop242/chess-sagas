import { z } from 'zod';
import { battlefieldEnvironmentSchema } from '../../narrative-analysis/models/narrative-analysis';
import { WOUND_CAUSE_TYPES } from '../../narrative-analysis/wound-planning';

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

const woundBeatSchema = z.object({
  pieceId: z.string().min(1),
  inflictedAtPly: z.number().int().positive(),
  injury: z.string().min(1),
  continuityPlies: z.array(z.number().int().positive()),
  recoveryPly: z.number().int().positive().nullable(),
  causeType: z.enum(WOUND_CAUSE_TYPES),
  sourcePieceId: z.string().min(1).nullable(),
});

const selectedRevengePayoffSchema = z.object({
  avengerPieceId: z.string().min(1),
  victimPieceId: z.string().min(1),
  deathPly: z.number().int().positive(),
  payoffPly: z.number().int().positive(),
});

export const storyOutlineSchema = z.object({
  battlefieldEnvironment: battlefieldEnvironmentSchema,
  selectedTitle: z.string().min(1),
  theme: z.string().min(1),
  acts: z.array(outlineActSchema).min(1),
  setupPayoffs: z.array(setupPayoffSchema),
  relationshipBeats: z.array(relationshipBeatSchema).min(2).max(4),
  selectedRevengePayoffs: z
    .array(selectedRevengePayoffSchema)
    .max(3)
    .default([]),
  woundBeats: z.array(woundBeatSchema).default([]),
  endingSequence: z.array(endingBeatSchema).min(1),
  proseConstraints: z.array(z.string().min(1)).min(1),
});

export type StoryOutline = z.infer<typeof storyOutlineSchema>;
