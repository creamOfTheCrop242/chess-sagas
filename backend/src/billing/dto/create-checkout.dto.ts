import { z } from 'zod';

export const billingProductSchema = z.enum([
  'single_saga',
  'five_sagas',
  'scribe',
  'chronicler',
  'realm_founder',
]);

export type BillingProduct = z.infer<typeof billingProductSchema>;

export const createCheckoutSchema = z.object({
  product: billingProductSchema,
});

export type CreateCheckoutDto = z.infer<typeof createCheckoutSchema>;
