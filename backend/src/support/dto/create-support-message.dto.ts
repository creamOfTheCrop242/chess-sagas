import { z } from 'zod';

export const supportCategories = [
  'bug',
  'suggestion',
  'billing',
  'account',
  'other',
] as const;

export const createSupportMessageSchema = z.object({
  category: z.enum(supportCategories),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(10).max(5000),
  website: z.string().max(0).optional().default(''),
});

export type CreateSupportMessageDto = z.infer<
  typeof createSupportMessageSchema
>;
