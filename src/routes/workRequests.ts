import { Router } from "express";
import { db } from "../db";
import { content, workRequests, tagLinks } from "../schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/requireAuth";
import crypto from "crypto";

const router = Router();

/* -----------------------------------------
   POST /work-requests
------------------------------------------ */
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;

    const {
      title,
      body,
      budgetMin,
      budgetMax,
      city,
      postalCode,
      tagIds = [],
    } = req.body;

    if (!title || !city) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const id = crypto.randomUUID();

    // 1. create content root
    await db.insert(content).values({
      id,
      type: "WORK_REQUEST",
      authorUserId: userId,
      title,
      body: body || null,
      isPublic: true,
      createdAt: new Date(),
    });

    // 2. create work request
    const [row] = await db
      .insert(workRequests)
      .values({
        id,
        requesterUserId: userId,
        budgetMin,
        budgetMax,
        city,
        postalCode,
        status: "OPEN",
        createdAt: new Date(),
      })
      .returning();

    // 3. assign tags if any
    if (Array.isArray(tagIds) && tagIds.length > 0) {
      const inserts = tagIds.map((tagId: string) => ({
        id: crypto.randomUUID(),
        tagId,
        entityType: "CONTENT",
        entityId: id,
      }));
      await db.insert(tagLinks).values(inserts);
    }

    res.json(row);

  } catch (err) {
    console.error("POST /work-requests error:", err);
    res.status(500).json({ error: "Create failed" });
  }
});

/* -----------------------------------------
   GET /work-requests/:id
------------------------------------------ */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db
      .select()
      .from(workRequests)
      .where(eq(workRequests.id, id));

    if (result.length === 0) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json(result[0]);
  } catch (err) {
    console.error("GET /work-requests/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
