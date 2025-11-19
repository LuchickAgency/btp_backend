import { Router } from "express";
import { db } from "../db";
import { comments, content, companyMemberships } from "../schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/requireAuth";
import crypto from "crypto";

const router = Router();

/* ---------------------------------------------------------
   POST /content/:contentId/comments
--------------------------------------------------------- */
router.post("/content/:contentId/comments", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { contentId } = req.params;
    const { body, parentCommentId } = req.body;

    if (!body || body.trim().length === 0) {
      return res.status(400).json({ error: "Comment cannot be empty" });
    }

    // vérifier que le contenu existe
    const contentRow = await db
      .select()
      .from(content)
      .where(eq(content.id, contentId));

    if (contentRow.length === 0) {
      return res.status(404).json({ error: "Content not found" });
    }

    const newId = crypto.randomUUID();

    const [row] = await db
      .insert(comments)
      .values({
        id: newId,
        contentId,
        authorUserId: userId,
        body,
        parentCommentId: parentCommentId || null,
        createdAt: new Date(),
      })
      .returning();

    res.json(row);

  } catch (err) {
    console.error("POST comment error:", err);
    res.status(500).json({ error: "Create comment failed" });
  }
});

/* ---------------------------------------------------------
   GET /content/:contentId/comments
--------------------------------------------------------- */
router.get("/content/:contentId/comments", async (req, res) => {
  try {
    const { contentId } = req.params;

    const rows = await db
      .select()
      .from(comments)
      .where(eq(comments.contentId, contentId));

    res.json(rows);

  } catch (err) {
    console.error("GET comments error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------------
   PATCH /comments/:id  (auteur uniquement)
--------------------------------------------------------- */
router.patch("/comments/:id", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const { body } = req.body;

    if (!body || body.trim() === "") {
      return res.status(400).json({ error: "Empty comment" });
    }

    const row = await db
      .select()
      .from(comments)
      .where(eq(comments.id, id));

    if (row.length === 0) {
      return res.status(404).json({ error: "Comment not found" });
    }

    if (row[0].authorUserId !== userId) {
      return res.status(403).json({ error: "Not your comment" });
    }

    const [updated] = await db
      .update(comments)
      .set({ body })
      .where(eq(comments.id, id))
      .returning();

    res.json(updated);

  } catch (err) {
    console.error("PATCH comment error:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

/* ---------------------------------------------------------
   DELETE /comments/:id 
   (auteur OU admin de la société du contenu)
--------------------------------------------------------- */
router.delete("/comments/:id", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    // récupérer le commentaire
    const rows = await db
      .select()
      .from(comments)
      .where(eq(comments.id, id));

    if (rows.length === 0) {
      return res.status(404).json({ error: "Comment not found" });
    }

    const comment = rows[0];

    // 1. auteur → OK
    if (comment.authorUserId === userId) {
      await db.delete(comments).where(eq(comments.id, id));
      return res.json({ success: true });
    }

    // 2. vérifier si c’est un post d’entreprise
    const contentRow = await db
      .select()
      .from(content)
      .where(eq(content.id, comment.contentId));

    if (
      contentRow.length > 0 &&
      contentRow[0].companyId
    ) {
      const companyId = contentRow[0].companyId;

      const admin = await db
        .select()
        .from(companyMemberships)
        .where(
          and(
            eq(companyMemberships.userId, userId),
            eq(companyMemberships.companyId, companyId)
          )
        );

      if (admin.length > 0) {
        await db.delete(comments).where(eq(comments.id, id));
        return res.json({ success: true });
      }
    }

    return res.status(403).json({ error: "Cannot delete this comment" });

  } catch (err) {
    console.error("DELETE comment error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

export default router;
