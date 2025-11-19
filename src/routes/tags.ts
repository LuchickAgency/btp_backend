import { Router } from "express";
import { db } from "../db";
import { tags, tagLinks } from "../schema";
import { eq, inArray } from "drizzle-orm";
import crypto from "crypto";
import { z } from "zod";

const router = Router();

/* ---------------------------------------------------------
   SCHEMAS ZOD
--------------------------------------------------------- */
const createTagSchema = z.object({
  slug: z.string().min(1),
  label: z.string().min(1),
  type: z.string().min(1),
});

const linkTagSchema = z.object({
  tagId: z.string().uuid(),
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
});

/* ---------------------------------------------------------
   GET /tags
--------------------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    const type = req.query.type as string | undefined;

    const rows = await db
      .select()
      .from(tags)
      .where(type ? eq(tags.type, type) : undefined);

    res.json(rows);
  } catch (err) {
    console.error("GET /tags error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------------
   POST /tags
--------------------------------------------------------- */
router.post("/", async (req, res) => {
  try {
    const parse = createTagSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid fields", details: parse.error });
    }

    const { slug, label, type } = parse.data;

    const [row] = await db
      .insert(tags)
      .values({
        id: crypto.randomUUID(),
        slug,
        label,
        type,
      })
      .returning();

    res.json(row);
  } catch (err) {
    console.error("POST /tags error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------------
   POST /tags/link
--------------------------------------------------------- */
router.post("/link", async (req, res) => {
  try {
    const parse = linkTagSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid fields", details: parse.error });
    }

    const { tagId, entityType, entityId } = parse.data;

    const [row] = await db
      .insert(tagLinks)
      .values({
        id: crypto.randomUUID(),
        tagId,
        entityType,
        entityId,
      })
      .returning();

    res.json(row);
  } catch (err) {
    console.error("POST /tags/link error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------------
   DELETE /tags/link/:id
--------------------------------------------------------- */
router.delete("/link/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const [row] = await db
      .delete(tagLinks)
      .where(eq(tagLinks.id, id))
      .returning();

    if (!row) return res.status(404).json({ error: "Link not found" });

    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /tags/link error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------------
   GET /tags/:tagId/entities
--------------------------------------------------------- */
router.get("/:tagId/entities", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(tagLinks)
      .where(eq(tagLinks.tagId, req.params.tagId));

    res.json(rows);
  } catch (err) {
    console.error("GET /tags/:tagId/entities error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
