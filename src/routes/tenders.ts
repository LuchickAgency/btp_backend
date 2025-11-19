import { Router } from "express";
import { db } from "../db";
import {
  content,
  tenders,
  tenderResponses,
  companyMemberships,
} from "../schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

/* ---------------------------------------------------------
   POST /tenders
   Créer un appel d’offre (ADMIN d'une société)
--------------------------------------------------------- */
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;

    const {
      issuingCompanyId,
      title,
      body,
      budgetEstimate,
      deadlineAt,
    } = req.body;

    if (!issuingCompanyId || !title || !deadlineAt) {
      return res.status(400).json({ error: "Missing fields" });
    }

    // vérifier que l'user est ADMIN
    const member = await db
      .select()
      .from(companyMemberships)
      .where(
        and(
          eq(companyMemberships.userId, userId),
          eq(companyMemberships.companyId, issuingCompanyId)
        )
      );

    if (
      member.length === 0 ||
      !JSON.parse(member[0].roles).includes("ADMIN")
    ) {
      return res.status(403).json({
        error: "NOT_ADMIN",
        message: "Only company admins can create tenders.",
      });
    }

    // ----------------------------------------
    // 1️⃣ Créer content
    // ----------------------------------------
    const contentId = crypto.randomUUID();

    await db.insert(content).values({
      id: contentId,
      type: "TENDER",
      authorUserId: userId,
      companyId: issuingCompanyId,
      title,
      body: body ?? null,
      isPublic: true,
      createdAt: new Date(),
    });

    // ----------------------------------------
    // 2️⃣ Créer tender
    // ----------------------------------------
    const [row] = await db
      .insert(tenders)
      .values({
        id: contentId, // FK vers content.id
        issuingCompanyId,
        budgetEstimate: budgetEstimate ?? null,
        deadlineAt: new Date(deadlineAt),
        status: "OPEN",
        createdAt: new Date(),
      })
      .returning();

    res.json({
      ...row,
      title,
      body,
    });
  } catch (err) {
    console.error("CREATE TENDER ERROR:", err);
    res.status(500).json({ error: "Create tender failed" });
  }
});

/* ---------------------------------------------------------
   GET /tenders  → liste publique
--------------------------------------------------------- */
router.get("/", async (_req, res) => {
  try {
    const rows = await db.select().from(tenders);
    res.json(rows);
  } catch (err) {
    console.error("LIST TENDERS ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------------
   GET /tenders/:id  → détails
--------------------------------------------------------- */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const rows = await db
      .select()
      .from(tenders)
      .where(eq(tenders.id, id));

    if (rows.length === 0)
      return res.status(404).json({ error: "Tender not found" });

    res.json(rows[0]);
  } catch (err) {
    console.error("GET TENDER ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------------
   GET /tenders/:id/responses
   Voir toutes les réponses (ADMIN seulement)
--------------------------------------------------------- */
router.get("/:id/responses", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const tender = await db
      .select()
      .from(tenders)
      .where(eq(tenders.id, id));

    if (tender.length === 0)
      return res.status(404).json({ error: "Tender not found" });

    const issuingCompanyId = tender[0].issuingCompanyId;

    const member = await db
      .select()
      .from(companyMemberships)
      .where(
        and(
          eq(companyMemberships.userId, userId),
          eq(companyMemberships.companyId, issuingCompanyId)
        )
      );

    if (
      member.length === 0 ||
      !JSON.parse(member[0].roles).includes("ADMIN")
    ) {
      return res.status(403).json({
        error: "NOT_ADMIN",
        message: "Only company admins can view responses.",
      });
    }

    const rows = await db
      .select()
      .from(tenderResponses)
      .where(eq(tenderResponses.tenderId, id));

    res.json(rows);
  } catch (err) {
    console.error("LIST RESPONSES ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------------
   POST /tenders/:id/responses
   Répondre à un appel d’offre
--------------------------------------------------------- */
router.post("/:id/responses", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const { companyId, amount, message } = req.body;

    const tenderRow = await db
      .select()
      .from(tenders)
      .where(eq(tenders.id, id));

    if (tenderRow.length === 0)
      return res.status(404).json({ error: "Tender not found" });

    const member = await db
      .select()
      .from(companyMemberships)
      .where(
        and(
          eq(companyMemberships.userId, userId),
          eq(companyMemberships.companyId, companyId)
        )
      );

    if (member.length === 0) {
      return res.status(403).json({
        error: "NOT_COMPANY_MEMBER",
        message: "You cannot reply on behalf of this company.",
      });
    }

    const newId = crypto.randomUUID();

    const [row] = await db
      .insert(tenderResponses)
      .values({
        id: newId,
        tenderId: id,
        companyId,
        amount: amount ?? null,
        message: message ?? null,
        status: "PENDING",
        createdAt: new Date(),
      })
      .returning();

    res.json(row);
  } catch (err) {
    console.error("TENDER RESPONSE ERROR:", err);
    res.status(500).json({ error: "Response failed" });
  }
});

/* ---------------------------------------------------------
   PATCH /tenders/:id/status  (ADMIN)
--------------------------------------------------------- */
router.patch("/:id/status", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const { status } = req.body;

    if (!["OPEN", "CLOSED", "AWARDED", "CANCELLED"].includes(status))
      return res.status(400).json({ error: "Invalid status" });

    const tender = await db
      .select()
      .from(tenders)
      .where(eq(tenders.id, id));

    if (tender.length === 0)
      return res.status(404).json({ error: "Tender not found" });

    const issuingCompanyId = tender[0].issuingCompanyId;

    const member = await db
      .select()
      .from(companyMemberships)
      .where(
        and(
          eq(companyMemberships.userId, userId),
          eq(companyMemberships.companyId, issuingCompanyId)
        )
      );

    if (
      member.length === 0 ||
      !JSON.parse(member[0].roles).includes("ADMIN")
    ) {
      return res.status(403).json({ error: "NOT_ADMIN" });
    }

    const updated = await db
      .update(tenders)
      .set({ status })
      .where(eq(tenders.id, id))
      .returning();

    res.json(updated[0]);
  } catch (err) {
    console.error("PATCH TENDER STATUS ERROR:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

/* ---------------------------------------------------------
   PATCH /tenders/:id/responses/:responseId/status
--------------------------------------------------------- */
router.patch("/:id/responses/:responseId/status", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id, responseId } = req.params;
    const { status } = req.body;

    if (!["PENDING", "SHORTLISTED", "REJECTED", "AWARDED"].includes(status))
      return res.status(400).json({ error: "Invalid status" });

    const tender = await db
      .select()
      .from(tenders)
      .where(eq(tenders.id, id));

    if (tender.length === 0)
      return res.status(404).json({ error: "Tender not found" });

    const issuingCompanyId = tender[0].issuingCompanyId;

    const member = await db
      .select()
      .from(companyMemberships)
      .where(
        and(
          eq(companyMemberships.userId, userId),
          eq(companyMemberships.companyId, issuingCompanyId)
        )
      );

    if (
      member.length === 0 ||
      !JSON.parse(member[0].roles).includes("ADMIN")
    ) {
      return res.status(403).json({ error: "NOT_ADMIN" });
    }

    const updated = await db
      .update(tenderResponses)
      .set({ status })
      .where(eq(tenderResponses.id, responseId))
      .returning();

    res.json(updated[0]);
  } catch (err) {
    console.error("PATCH RESPONSE STATUS ERROR:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

export default router;
