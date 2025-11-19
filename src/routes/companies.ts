import { Router } from "express";
import { db } from "../db";
import { companies, companyMemberships } from "../schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

import { checkCompanyPermission } from "../middleware/checkCompanyPermission";
import { requireAuth } from "../middleware/requireAuth";

import {
  createCompanySchema,
  updateCompanySchema,
} from "../schemas/company.schema";

const router = Router();

/* ---------------------------------------------------------
   SLUGIFY
--------------------------------------------------------- */
function slugify(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ---------------------------------------------------------
   GET /companies → liste publique
--------------------------------------------------------- */
router.get("/", async (_req, res) => {
  try {
    const result = await db.select().from(companies);
    res.json(result);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------------
   GET /companies/:slug → fiche publique
--------------------------------------------------------- */
router.get("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const result = await db
      .select()
      .from(companies)
      .where(eq(companies.slug, slug));

    if (result.length === 0) {
      return res.status(404).json({ error: "Company not found" });
    }

    res.json(result[0]);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------------
   POST /companies → créer une entreprise
--------------------------------------------------------- */
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;

    // Validation Zod
    const parsed = createCompanySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "INVALID_DATA",
        details: parsed.error.flatten(),
      });
    }

    const data = parsed.data;

    const slug = slugify(`${data.name}-${data.city}`);

    // Vérifier slug unique
    const exists = await db
      .select()
      .from(companies)
      .where(eq(companies.slug, slug));

    if (exists.length > 0) {
      return res
        .status(400)
        .json({ error: "Company with similar name already exists" });
    }

    const id = crypto.randomUUID();

    const [company] = await db
      .insert(companies)
      .values({
        id,
        slug,
        createdByUserId: userId,
        ...data,
      })
      .returning();

    // Auto Administrateur
    await db.insert(companyMemberships).values({
      id: crypto.randomUUID(),
      userId,
      companyId: id,
      roles: JSON.stringify(["ADMIN"]),
      status: "active",
    });

    res.json(company);
  } catch (err) {
    console.error("Create company error:", err);
    res.status(500).json({ error: "Company creation failed" });
  }
});

/* ---------------------------------------------------------
   PUT /companies/:companyId → update ADMIN ONLY
--------------------------------------------------------- */
router.put(
  "/id/:companyId",
  requireAuth,
  checkCompanyPermission(["ADMIN"]),
  async (req, res) => {
    try {
      const { companyId } = req.params;

      // Zod validation
      const parsed = updateCompanySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "INVALID_DATA",
          details: parsed.error.flatten(),
        });
      }

      const updates = parsed.data;

      // Ne pas autoriser à update slug ou createdByUserId
      delete (updates as any).slug;
      delete (updates as any).createdByUserId;

      const updated = await db
        .update(companies)
        .set(updates)
        .where(eq(companies.id, companyId))
        .returning();

      if (updated.length === 0) {
        return res.status(404).json({ error: "Company not found" });
      }

      res.json(updated[0]);
    } catch (err) {
      console.error("Update company error:", err);
      res.status(500).json({ error: "Update failed" });
    }
  }
);

export default router;
