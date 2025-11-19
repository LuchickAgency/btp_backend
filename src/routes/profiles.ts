import { Router } from "express";
import { db } from "../db";
import { profiles, users } from "../schema";
import { eq } from "drizzle-orm";
import { updateProfileSchema } from "../schemas/profile.schema";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

/* -----------------------------
   GET profil public
----------------------------- */
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await db
      .select({
        userId: profiles.userId,
        displayName: profiles.displayName,
        firstName: profiles.firstName,
        lastName: profiles.lastName,
        avatarUrl: profiles.avatarUrl,
        coverUrl: profiles.coverUrl,
        headline: profiles.headline,
        bio: profiles.bio,
        city: profiles.city,
        country: profiles.country,
        btpRoles: profiles.btpRoles,
        experienceYears: profiles.experienceYears,
        email: users.email
      })
      .from(profiles)
      .leftJoin(users, eq(profiles.userId, users.id))
      .where(eq(profiles.userId, userId));

    if (result.length === 0) {
      return res.status(404).json({ error: "Profile not found" });
    }

    res.json(result[0]);

  } catch (err) {
    console.error("PROFILE ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -----------------------------
   UPDATE MON PROFIL
----------------------------- */
router.put("/me", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;

    // Validation Zod
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "INVALID_DATA",
        details: parsed.error.flatten(),
      });
    }

    const updates = parsed.data;

    const updated = await db
      .update(profiles)
      .set(updates)
      .where(eq(profiles.userId, userId))
      .returning();

    res.json(updated[0]);

  } catch (err) {
    console.error("UPDATE PROFILE ERROR:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

export default router;
