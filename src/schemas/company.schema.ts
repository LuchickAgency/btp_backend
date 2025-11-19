import { z } from "zod";

export const siretSchema = z
  .string()
  .length(14)
  .regex(/^\d+$/)
  .optional()
  .refine((val) => {
    if (!val) return true; // SIRET non obligatoire
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      let d = parseInt(val[i], 10);
      if (i % 2 === 0) d *= 2;
      if (d > 9) d -= 9;
      sum += d;
    }
    return sum % 10 === 0;
  }, "Invalid SIRET format");

export const createCompanySchema = z.object({
  name: z.string().min(2),
  city: z.string().min(2),
  siret: siretSchema,
  description: z.string().optional(),
  address: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
  bannerUrl: z.string().url().optional(),
});

export const updateCompanySchema = createCompanySchema.partial();
