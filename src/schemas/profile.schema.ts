import { z } from "zod";

export const updateProfileSchema = z.object({
  displayName: z.string().min(2).optional(),
  firstName: z.string().min(2).nullable().optional(),
  lastName: z.string().min(2).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
  headline: z.string().max(255).nullable().optional(),
  bio: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  btpRoles: z.string().nullable().optional(), // JSON string
  experienceYears: z.number().int().min(0).max(80).nullable().optional(),
});
