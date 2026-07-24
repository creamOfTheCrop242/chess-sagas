import { z } from 'zod';
import { storySceneSchema } from '../../scene-breakdown/models/scene-breakdown';

export const generatedStorySchema = z.object({
  title: z.string().min(1),
  storyMarkdown: z.string().min(500),
});

export type GeneratedStoryDraft = z.infer<typeof generatedStorySchema>;

export const generatedStoryPackageSchema = z.object({
  title: z.string().min(1),
  scenes: z.array(storySceneSchema).min(1),
});

export type GeneratedStoryPackage = z.infer<typeof generatedStoryPackageSchema>;
