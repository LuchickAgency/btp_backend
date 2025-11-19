import { Router } from "express";
import { db } from "../db";
import { workRequests, workProposals, companyMemberships } from "../schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/requireAuth";
import crypto from "crypto";

const router = Router();

/* ---------------------------------------------------------
   POST /work-requests/:id/proposals
--------------------------------------------------------- */
router.post("/:id/proposals", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const { companyId, message, proposedAmount } = req.body;

    // 1. vérifier que la demande existe
    const reqRow = await db
      .select()
      .from(workRequests)
      .where(eq(workRequests.id, id));

    if (reqRow.length === 0) {
      return res.status(404).json({ error: "Work request not found" });
    }

    // 2. vérifier que l'user appartient bien à la société
    const member = await db
      .select()
      .from(companyMemberships)
      .where(
        sql`${companyMemberships.userId} = ${userId}
             AND ${companyMemberships.companyId} = ${companyId}`
      );

    if (member.length === 0) {
      return res.status(403).json({
        error: "NOT_COMPANY_MEMBER",
        message: "You cannot reply on behalf of this company.",
      });
    }

    // 3. créer la proposition
    const [row] = await db
      .insert(workProposals)
      .values({
        id: crypto.randomUUID(),
        workRequestId: id,
        companyId,
        message: message || null,
        proposedAmount: proposedAmount || null,
        status: "PENDING",
        createdAt: new Date(),
      })
      .returning();

    res.json(row);

  } catch (err) {
    console.error("POST proposal error:", err);
    res.status(500).json({ error: "Proposal failed" });
  }
});

/* ---------------------------------------------------------
   GET /work-requests/:id/proposals
--------------------------------------------------------- */
router.get("/:id/proposals", async (req, res) => {
  try {
    const { id } = req.params;

    const rows = await db
      .select()
      .from(workProposals)
      .where(eq(workProposals.workRequestId, id));

    res.json(rows);
  } catch (err) {
    console.error("GET proposals error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------------
   PATCH /work-requests/:id/status
--------------------------------------------------------- */
router.patch("/:id/status", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const { status } = req.body;

    if (!["OPEN", "CLOSED", "CANCELLED"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const reqRow = await db
      .select()
      .from(workRequests)
      .where(eq(workRequests.id, id));

    if (reqRow.length === 0) {
      return res.status(404).json({ error: "Work request not found" });
    }

    if (reqRow[0].requesterUserId !== userId) {
      return res.status(403).json({ error: "Not your request" });
    }

    const [updated] = await db
      .update(workRequests)
      .set({ status })
      .where(eq(workRequests.id, id))
      .returning();

    res.json(updated);

  } catch (err) {
    console.error("PATCH status error:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

export default router;
