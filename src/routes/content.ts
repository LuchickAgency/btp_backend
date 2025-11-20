import { Router } from "express";
import { db } from "../db";
import {
  content,
  tagLinks,
  tags,
  contentMedia,
  mediaAssets,
} from "../schema";

import { eq, inArray, and, desc } from "drizzle-orm";
import crypto from "crypto";
import { requireAuth } from "../middleware/requireAuth";
import { z } from "zod";
import { sql } from "drizzle-orm";

import {
  makeCacheKey,
  getCachedContent,
  setCachedContent,
  clearContentCache,
} from "../app";

const router = Router();

/* ---------------------------------------------------------
   ZOD Schemas
--------------------------------------------------------- */
const createPostSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  isPublic: z.boolean().optional().default(true),
  companyId: z.string().uuid().optional(),
  tagIds: z.array(z.string().uuid()).optional().default([]),
  mediaIds: z
    .array(z.string().uuid())
    .max(10, "Max 10 médias par post")
    .optional()
    .default([]),
});

const reorderSchema = z.object({
  mediaIds: z.array(z.string().uuid()),
});

const coverSchema = z.object({
  mediaId: z.string().uuid(),
});

/* ---------------------------------------------------------
   HELPERS LOADING MEDIA + TAGS
--------------------------------------------------------- */
async function loadMediaForPosts(ids: string[]) {
  if (ids.length === 0) return new Map();

  const rows = await db
    .select({
      id: mediaAssets.id,
      ownerId: mediaAssets.ownerId,
      url: mediaAssets.url,
      type: mediaAssets.type,
      mimeType: mediaAssets.mimeType,
      width: mediaAssets.width,
      height: mediaAssets.height,
      sizeBytes: mediaAssets.sizeBytes,
      storageProvider: mediaAssets.storageProvider,
      createdAt: mediaAssets.createdAt,
      contentId: contentMedia.contentId,
      sortOrder: contentMedia.sortOrder,
      isCover: contentMedia.isCover,
    })
    .from(contentMedia)
    .innerJoin(mediaAssets, eq(contentMedia.mediaId, mediaAssets.id))
    .where(inArray(contentMedia.contentId, ids))
    .orderBy(contentMedia.sortOrder, desc(mediaAssets.createdAt));

  const map = new Map<string, any[]>();

  for (const row of rows) {
    const arr = map.get(row.contentId) ?? [];
    arr.push(row);
    map.set(row.contentId, arr);
  }

  return map;
}

async function loadTagsForPosts(ids: string[]) {
  if (ids.length === 0) return new Map();

  const rows = await db
    .select({
      id: tags.id,
      slug: tags.slug,
      label: tags.label,
      type: tags.type,
      createdAt: tags.createdAt,
      entityId: tagLinks.entityId,
    })
    .from(tagLinks)
    .innerJoin(tags, eq(tagLinks.tagId, tags.id))
    .where(
      and(inArray(tagLinks.entityId, ids), eq(tagLinks.entityType, "CONTENT"))
    );

  const map = new Map<string, any[]>();

  for (const row of rows) {
    const arr = map.get(row.entityId) ?? [];
    arr.push(row);
    map.set(row.entityId, arr);
  }

  return map;
}

/* ---------------------------------------------------------
   POST /content/posts
--------------------------------------------------------- */
router.post("/posts", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const parsed = createPostSchema.safeParse(req.body);

    if (!parsed.success)
      return res.status(400).json({ error: "INVALID_DATA", details: parsed.error.flatten() });

    const { title, body, isPublic, companyId, tagIds, mediaIds } = parsed.data;

    if (!title && !body && mediaIds.length === 0)
      return res.status(400).json({ error: "MISSING_CONTENT" });

    // quota
    const totalMedia = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(mediaAssets)
      .where(eq(mediaAssets.ownerId, userId));

    if (totalMedia[0].count > 1000)
      return res.status(400).json({
        error: "MEDIA_QUOTA_EXCEEDED",
        message: "Vous avez trop de médias.",
      });

    // check medias
    if (mediaIds.length > 0) {
      const found = await db
        .select()
        .from(mediaAssets)
        .where(inArray(mediaAssets.id, mediaIds));

      if (found.length !== mediaIds.length)
        return res.status(400).json({ error: "INVALID_MEDIA_ID" });
    }

    const id = crypto.randomUUID();

    const [created] = await db
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

    // tags
    if (tagIds.length > 0) {
      await db.insert(tagLinks).values(
        tagIds.map((tid) => ({
          id: crypto.randomUUID(),
          tagId: tid,
          entityId: id,
          entityType: "CONTENT",
        }))
      );
    }

    // medias
    if (mediaIds.length > 0) {
      await db.insert(contentMedia).values(
        mediaIds.map((mid, index) => ({
          id: crypto.randomUUID(),
          contentId: id,
          mediaId: mid,
          sortOrder: index,
          isCover: index === 0,
        }))
      );
    }

    const media = (await loadMediaForPosts([id])).get(id) ?? [];
    const tagsForPost = (await loadTagsForPosts([id])).get(id) ?? [];

    clearContentCache();

    res.json({ ...created, media, tags: tagsForPost });
  } catch (err) {
    console.error("POST /content/posts error", err);
    res.status(500).json({ error: "CREATE_POST_FAILED" });
  }
});

/* ---------------------------------------------------------
   GET /content/:id
--------------------------------------------------------- */
router.get("/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const rows = await db.select().from(content).where(eq(content.id, id));
    if (rows.length === 0) return res.status(404).json({ error: "NOT_FOUND" });

    const media = (await loadMediaForPosts([id])).get(id) ?? [];
    const tagsForPost = (await loadTagsForPosts([id])).get(id) ?? [];

    res.json({ ...rows[0], media, tags: tagsForPost });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

/* ---------------------------------------------------------
   GET /content — feed + cache
--------------------------------------------------------- */
router.get("/", async (req, res) => {
  const cacheKey = makeCacheKey(req.query);
  const cached = getCachedContent(cacheKey);

  if (cached) return res.json(cached);

  try {
    const type = req.query.type as string | undefined;
    const companyId = req.query.companyId as string | undefined;
    const authorId = req.query.authorId as string | undefined;
    const search = req.query.search as string | undefined;

    const tagIdsParam = (req.query.tagIds as string | undefined) || "";
    const tagIds = tagIdsParam
      ? tagIdsParam.split(",").map((s) => s.trim()).filter((id) => /^[0-9a-fA-F-]{36}$/.test(id))
      : [];

    let page = Math.max(Number(req.query.page ?? "1"), 1);
    let pageSize = Math.min(Math.max(Number(req.query.pageSize ?? "20"), 1), 100);

    const offset = (page - 1) * pageSize;
    const limitPlusOne = pageSize + 1;

    const conditions: any[] = [eq(content.isPublic, true)];

    if (tagIds.length > 0) {
      const links = await db
        .select()
        .from(tagLinks)
        .where(
          and(inArray(tagLinks.tagId, tagIds), eq(tagLinks.entityType, "CONTENT"))
        );

      const ids = Array.from(new Set(links.map((l) => l.entityId)));

      if (ids.length === 0)
        return res.json({ page, pageSize, hasMore: false, items: [] });

      conditions.push(inArray(content.id, ids));
    }

    if (companyId && /^[0-9a-fA-F-]{36}$/.test(companyId))
      conditions.push(eq(content.companyId, companyId));

    if (authorId && /^[0-9a-fA-F-]{36}$/.test(authorId))
      conditions.push(eq(content.authorUserId, authorId));

    if (search) {
      conditions.push(
        sql`${content.title} ILIKE ${"%" + search + "%"} OR ${content.body} ILIKE ${"%" + search + "%"}`
      );
    }

    if (type && type !== "all") {
      conditions.push(eq(content.type, type));
    }

    const rows = await db
      .select()
      .from(content)
      .where(and(...conditions))
      .orderBy(desc(content.createdAt))
      .limit(limitPlusOne)
      .offset(offset);

    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;

    const ids = pageRows.map((p) => p.id);

    const mediaByContent = await loadMediaForPosts(ids);
    const tagsByContent = await loadTagsForPosts(ids);

    const items = pageRows.map((post) => ({
      ...post,
      media: mediaByContent.get(post.id) ?? [],
      tags: tagsByContent.get(post.id) ?? [],
    }));

    const response = { page, pageSize, hasMore, items };

    setCachedContent(cacheKey, response);

    res.json(response);
  } catch (err) {
    console.error("GET /content error", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

/* ---------------------------------------------------------
   DELETE /content/:id/media/:mediaId
--------------------------------------------------------- */
router.delete("/:id/media/:mediaId", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id, mediaId } = req.params;

    const rows = await db.select().from(content).where(eq(content.id, id));
    if (rows.length === 0) return res.status(404).json({ error: "NOT_FOUND" });

    const post = rows[0];

    if (post.authorUserId !== userId)
      return res.status(403).json({ error: "NOT_ALLOWED" });

    await db
      .delete(contentMedia)
      .where(
        and(eq(contentMedia.contentId, id), eq(contentMedia.mediaId, mediaId))
      );

    const remaining = await db
      .select()
      .from(contentMedia)
      .where(eq(contentMedia.contentId, id))
      .orderBy(contentMedia.sortOrder);

    if (remaining.length > 0) {
      await db
        .update(contentMedia)
        .set({ isCover: false })
        .where(eq(contentMedia.contentId, id));

      for (let i = 0; i < remaining.length; i++) {
        await db
          .update(contentMedia)
          .set({
            sortOrder: i,
            isCover: i === 0,
          })
          .where(eq(contentMedia.id, remaining[i].id));
      }
    }

    clearContentCache();

    const media = (await loadMediaForPosts([id])).get(id) ?? [];
    const tagsForPost = (await loadTagsForPosts([id])).get(id) ?? [];

    res.json({ ...post, media, tags: tagsForPost });
  } catch (err) {
    console.error("DELETE error", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

/* ---------------------------------------------------------
   PATCH /content/:id/media/reorder
--------------------------------------------------------- */
router.patch("/:id/media/reorder", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "INVALID_DATA", details: parsed.error.flatten() });

    const rows = await db.select().from(content).where(eq(content.id, id));
    if (rows.length === 0) return res.status(404).json({ error: "NOT_FOUND" });

    const post = rows[0];

    if (post.authorUserId !== userId)
      return res.status(403).json({ error: "NOT_ALLOWED" });

    const newOrder = parsed.data.mediaIds;

    const existing = await db
      .select()
      .from(contentMedia)
      .where(eq(contentMedia.contentId, id));

    const existingIds = existing.map((e) => e.mediaId);

    if (existingIds.length !== newOrder.length)
      return res.status(400).json({ error: "INVALID_MEDIA_SET" });

    for (const mid of newOrder) {
      if (!existingIds.includes(mid))
        return res.status(400).json({ error: "INVALID_MEDIA_SET" });
    }

    for (let i = 0; i < newOrder.length; i++) {
      await db
        .update(contentMedia)
        .set({ sortOrder: i })
        .where(
          and(eq(contentMedia.contentId, id), eq(contentMedia.mediaId, newOrder[i]))
        );
    }

    clearContentCache();

    const media = (await loadMediaForPosts([id])).get(id) ?? [];
    const tagsForPost = (await loadTagsForPosts([id])).get(id) ?? [];

    res.json({ ...post, media, tags: tagsForPost });
  } catch (err) {
    console.error("REORDER error", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

/* ---------------------------------------------------------
   PATCH /content/:id/media/cover
--------------------------------------------------------- */
router.patch("/:id/media/cover", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const parsed = coverSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "INVALID_DATA", details: parsed.error.flatten() });

    const rows = await db.select().from(content).where(eq(content.id, id));
    if (rows.length === 0) return res.status(404).json({ error: "NOT_FOUND" });

    const post = rows[0];

    if (post.authorUserId !== userId)
      return res.status(403).json({ error: "NOT_ALLOWED" });

    const mid = parsed.data.mediaId;

    const existing = await db
      .select()
      .from(contentMedia)
      .where(and(eq(contentMedia.contentId, id), eq(contentMedia.mediaId, mid)));

    if (existing.length === 0)
      return res.status(400).json({ error: "MEDIA_NOT_IN_POST" });

    await db
      .update(contentMedia)
      .set({ isCover: false })
      .where(eq(contentMedia.contentId, id));

    await db
      .update(contentMedia)
      .set({ isCover: true })
      .where(and(eq(contentMedia.contentId, id), eq(contentMedia.mediaId, mid)));

    clearContentCache();

    const media = (await loadMediaForPosts([id])).get(id) ?? [];
    const tagsForPost = (await loadTagsForPosts([id])).get(id) ?? [];

    res.json({ ...post, media, tags: tagsForPost });
  } catch (err) {
    console.error("SET COVER error", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

export default router;
