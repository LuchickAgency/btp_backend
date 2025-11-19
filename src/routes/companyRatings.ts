import { Router } from "express";
import { db } from "../db";
import { companies, companyRatings } from "../schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/requireAuth";
import crypto from "crypto";

const router = Router();

/* ---------------------------------------------------------
   Utils : recalcul moyenne + compteur pour une société
--------------------------------------------------------- */
async function recalcCompanyRating(companyId: string) {
  const rows = await db
    .select({ rating: companyRatings.rating })
    .from(companyRatings)
    .where(eq(companyRatings.companyId, companyId));

  const count = rows.length;

  if (count === 0) {
    // Aucun avis → averageRating = null
    await db
      .update(companies)
      .set({
        averageRating: null, // OK pour numeric()
        ratingsCount: 0,
      })
      .where(eq(companies.id, companyId));
    return;
  }

  // Somme & moyenne
  const sum = rows.reduce((acc, r) => acc + r.rating, 0);
  const avg = sum / count;

  // Drizzle numeric() → doit recevoir une string
  const avgString = avg.toFixed(2);

  await db
    .update(companies)
    .set({
      averageRating: avgString, // string OK
      ratingsCount: count,
    })
    .where(eq(companies.id, companyId));
}

/* ---------------------------------------------------------
   POST /companies/:companyId/ratings
   → créer OU mettre à jour sa note sur une société
--------------------------------------------------------- */
router.post(
  "/companies/:companyId/ratings",
  requireAuth,
  async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { companyId } = req.params;
      const { rating, comment } = req.body;

      const intRating = Number(rating);
      if (!Number.isInteger(intRating) || intRating < 1 || intRating > 5) {
        return res
          .status(400)
          .json({ error: "Rating must be an integer between 1 and 5" });
      }

      // Vérifier que la société existe
      const company = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId));

      if (company.length === 0) {
        return res.status(404).json({ error: "Company not found" });
      }

      // Chercher si l'utilisateur a déjà noté cette société
      const existing = await db
        .select()
        .from(companyRatings)
        .where(
          sql`${companyRatings.companyId} = ${companyId}
               AND ${companyRatings.userId} = ${userId}`
        );

      let resultRow;

      if (existing.length > 0) {
        // Update avis existant
        const [updated] = await db
          .update(companyRatings)
          .set({
            rating: intRating,
            comment: comment ?? existing[0].comment,
          })
          .where(eq(companyRatings.id, existing[0].id))
          .returning();
        resultRow = updated;
      } else {
        // Create nouvel avis
        const [inserted] = await db
          .insert(companyRatings)
          .values({
            id: crypto.randomUUID(),
            companyId,
            userId,
            rating: intRating,
            comment: comment ?? null,
            createdAt: new Date(),
          })
          .returning();
        resultRow = inserted;
      }

      // Recalcul moyenne & compteur
      await recalcCompanyRating(companyId);

      res.json(resultRow);
    } catch (err) {
      console.error("POST /companies/:companyId/ratings error:", err);
      res.status(500).json({ error: "Rating failed" });
    }
  }
);

/* ---------------------------------------------------------
   GET /companies/:companyId/ratings
   → liste de tous les avis sur une société
--------------------------------------------------------- */
router.get("/companies/:companyId/ratings", async (req, res) => {
  try {
    const { companyId } = req.params;

    const rows = await db
      .select()
      .from(companyRatings)
      .where(eq(companyRatings.companyId, companyId));

    res.json(rows);
  } catch (err) {
    console.error("GET /companies/:companyId/ratings error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------------
   PATCH /ratings/:ratingId
   → l’utilisateur modifie son avis
--------------------------------------------------------- */
router.patch("/ratings/:ratingId", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { ratingId } = req.params;
    const { rating, comment } = req.body;

    const rows = await db
      .select()
      .from(companyRatings)
      .where(eq(companyRatings.id, ratingId));

    if (rows.length === 0) {
      return res.status(404).json({ error: "Rating not found" });
    }

    const ratingRow = rows[0];

    if (ratingRow.userId !== userId) {
      return res.status(403).json({ error: "Not your rating" });
    }

    let newRating = ratingRow.rating;
    if (rating !== undefined) {
      const intRating = Number(rating);
      if (!Number.isInteger(intRating) || intRating < 1 || intRating > 5) {
        return res
          .status(400)
          .json({ error: "Rating must be an integer between 1 and 5" });
      }
      newRating = intRating;
    }

    const [updated] = await db
      .update(companyRatings)
      .set({
        rating: newRating,
        comment: comment ?? ratingRow.comment,
      })
      .where(eq(companyRatings.id, ratingId))
      .returning();

    await recalcCompanyRating(ratingRow.companyId);

    res.json(updated);
  } catch (err) {
    console.error("PATCH /ratings/:ratingId error:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

export default router;
