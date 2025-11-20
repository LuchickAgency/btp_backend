import { Router } from "express";
import { db } from "../db";
import { content, companies, legalArticles } from "../schema";
import { ilike, and, or, desc, eq } from "drizzle-orm";

const router = Router();

/* ---------------------------------------------------------
   GET /search?q=...&limit=...
   Recherche globale BTP (publique)
--------------------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    const q = (req.query.q as string | undefined)?.trim() || "";
    const limit = parseInt((req.query.limit as string) || "10", 10);

    if (!q) {
      return res.status(400).json({ error: "MISSING_QUERY" });
    }

    const like = `%${q}%`;

    // 1) Recherche sur le content public (posts, jobs, work requests, tenders...)
    const contentResults = await db
      .select()
      .from(content)
      .where(
        and(
          eq(content.isPublic, true),
          or(
            ilike(content.title, like),
            ilike(content.body, like)
          )
        )
      )
      .orderBy(desc(content.createdAt))
      .limit(limit);

    // 2) Recherche sur les entreprises
    const companyResults = await db
      .select()
      .from(companies)
      .where(
        or(
          ilike(companies.name, like),
          ilike(companies.city, like)
        )
      )
      .orderBy(desc(companies.createdAt))
      .limit(limit);

    // 3) Recherche sur les articles juridiques
    const legalResults = await db
      .select()
      .from(legalArticles)
      .where(
        or(
          ilike(legalArticles.title, like),
          ilike(legalArticles.body, like)
        )
      )
      .orderBy(desc(legalArticles.createdAt))
      .limit(limit);

    res.json({
      q,
      content: contentResults,
      companies: companyResults,
      legal: legalResults,
    });
  } catch (err) {
    console.error("GET /search error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
