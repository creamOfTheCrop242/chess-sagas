import { z } from 'zod';

export const generatedStorySchema = z.object({
  title: z.string().min(1),
  storyMarkdown: z.string().min(500),
});

export type GeneratedStoryDraft = z.infer<typeof generatedStorySchema>;
