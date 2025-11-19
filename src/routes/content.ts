import { Router } from "express";
import { db } from "../db";
import { content, tagLinks } from "../schema";
import { eq, inArray, and, desc } from "drizzle-orm";
import crypto from "crypto";
import { requireAuth } from "../middleware/requireAuth";
import { z } from "zod";

const router = Router();

/* ---------------------------------------------------------
   ZOD Schemas
--------------------------------------------------------- */
const createPostSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  isPublic: z.boolean().optional().default(true),
  companyId: z.string().uuid().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});

/* ---------------------------------------------------------
   POST /content/posts
   Créer un post simple (type = "POST")
--------------------------------------------------------- */
router.post("/posts", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;

    const parsed = createPostSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "INVALID_DATA",
        details: parsed.error.flatten(),
      });
    }

    const { title, body, isPublic, companyId, tagIds = [] } = parsed.data;

    if (!title && !body) {
      return res.status(400).json({ error: "Missing content" });
    }

    const id = crypto.randomUUID();

    const [row] = await db
      .insert(content)
      .values({
        id,
        type: "POST",
        authorUserId: userId,
        companyId: companyId ?? null,
        title: title ?? null,
        body: body ?? null,
        isPublic: isPublic ?? true,
        createdAt: new Date(),
      })
      .returning();

    if (tagIds.length > 0) {
      await db.insert(tagLinks).values(
        tagIds.map((tagId) => ({
          id: crypto.randomUUID(),
          tagId,
          entityType: "CONTENT",
          entityId: id,
        }))
      );
    }

    res.json(row);
  } catch (err) {
    console.error("POST /content/posts error:", err);
    res.status(500).json({ error: "Create post failed" });
  }
});

/* ---------------------------------------------------------
   GET /content/:id
--------------------------------------------------------- */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const rows = await db
      .select()
      .from(content)
      .where(eq(content.id, id));

    if (rows.length === 0) {
      return res.status(404).json({ error: "Content not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("GET /content/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------------------------------------
   GET /content  (FEED PUBLIC)
   Query params possibles :
   - type=POST|WORK_REQUEST|JOB_OFFER|TENDER|LEGAL|all (optionnel)
   - tagIds=uuid1,uuid2,uuid3 (optionnel)
   - page=1 (optionnel, défaut 1)
   - pageSize=20 (optionnel, défaut 20, max 100)
--------------------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    const type = (req.query.type as string | undefined) || undefined;
    const tagIdsParam = (req.query.tagIds as string | undefined) || "";

    let page = Number(req.query.page ?? "1");
    let pageSize = Number(req.query.pageSize ?? "20");

    if (!Number.isFinite(page) || page < 1) page = 1;
    if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 20;
    if (pageSize > 100) pageSize = 100;

    const offset = (page - 1) * pageSize;

    const conditions = [eq(content.isPublic, true)];

    if (type && type !== "all") {
      conditions.push(eq(content.type, type));
    }

    // Pas de filtres de tags → simple pagination
    if (!tagIdsParam) {
      const rows = await db
        .select()
        .from(content)
        .where(and(...conditions))
        .orderBy(desc(content.createdAt))
        .limit(pageSize)
        .offset(offset);

      return res.json(rows);
    }

    // Filtrage par tags
    const tagIds = tagIdsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (tagIds.length === 0) {
      const rows = await db
        .select()
        .from(content)
        .where(and(...conditions))
        .orderBy(desc(content.createdAt))
        .limit(pageSize)
        .offset(offset);

      return res.json(rows);
    }

    // Récupérer les liens tag → content
    const links = await db
      .select()
      .from(tagLinks)
      .where(
        and(
          inArray(tagLinks.tagId, tagIds),
          eq(tagLinks.entityType, "CONTENT")
        )
      );

    const entityIds = Array.from(new Set(links.map((l) => l.entityId)));

    if (entityIds.length === 0) {
      return res.json([]);
    }

    const rows = await db
      .select()
      .from(content)
      .where(and(...conditions, inArray(content.id, entityIds)))
      .orderBy(desc(content.createdAt))
      .limit(pageSize)
      .offset(offset);

    res.json(rows);
  } catch (err) {
    console.error("GET /content error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
