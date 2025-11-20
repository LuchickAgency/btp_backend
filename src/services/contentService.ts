import { db } from "../db";
import {
  content,
  tagLinks,
  contentMedia,
  mediaAssets
} from "../schema";
import { eq, inArray, and, desc } from "drizzle-orm";
import crypto from "crypto";

/* ------------------------------------------
   CREATE POST + TAGS + MEDIA
------------------------------------------- */
export async function createPostService({
  authorUserId,
  title,
  body,
  isPublic,
  companyId,
  tagIds,
  mediaIds
}: {
  authorUserId: string;
  title?: string;
  body?: string;
  isPublic?: boolean;
  companyId?: string | null;
  tagIds: string[];
  mediaIds: string[];
}) {
  const contentId = crypto.randomUUID();

  // vérif médias (s'ils existent)
  if (mediaIds.length > 0) {
    const existing = await db
      .select()
      .from(mediaAssets)
      .where(inArray(mediaAssets.id, mediaIds));

    if (existing.length !== mediaIds.length) {
      throw new Error("INVALID_MEDIA_ID");
    }
  }

  const [created] = await db
    .insert(content)
    .values({
      id: contentId,
      type: "POST",
      authorUserId,
      companyId: companyId ?? null,
      title: title ?? null,
      body: body ?? null,
      isPublic: isPublic ?? true,
      createdAt: new Date()
    })
    .returning();

  // Tags
  if (tagIds.length > 0) {
    await db.insert(tagLinks).values(
      tagIds.map(tagId => ({
        id: crypto.randomUUID(),
        tagId,
        entityType: "CONTENT",
        entityId: contentId
      }))
    );
  }

  // Media : ordre = index, premier = cover
  if (mediaIds.length > 0) {
    await db.insert(contentMedia).values(
      mediaIds.map((mediaId, index) => ({
        id: crypto.randomUUID(),
        contentId,
        mediaId,
        sortOrder: index,
        isCover: index === 0
      }))
    );
  }

  return { ...created };
}

/* ------------------------------------------
   READ
------------------------------------------- */
export async function getContentById(id: string) {
  const rows = await db.select().from(content).where(eq(content.id, id));
  return rows[0] ?? null;
}

export async function getContentMedia(contentId: string) {
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
      sortOrder: contentMedia.sortOrder,
      isCover: contentMedia.isCover,
    })
    .from(contentMedia)
    .innerJoin(mediaAssets, eq(contentMedia.mediaId, mediaAssets.id))
    .where(eq(contentMedia.contentId, contentId))
    .orderBy(contentMedia.sortOrder, desc(mediaAssets.createdAt));

  return rows;
}

export async function getFeed(params: {
  type?: string;
  page: number;
  pageSize: number;
}) {
  const { type, page, pageSize } = params;
  const offset = (page - 1) * pageSize;

  const conditions = [eq(content.isPublic, true)];
  if (type && type !== "all") {
    conditions.push(eq(content.type, type));
  }

  const rows = await db
    .select()
    .from(content)
    .where(and(...conditions))
    .orderBy(desc(content.createdAt))
    .limit(pageSize)
    .offset(offset);

  return rows;
}

/* ------------------------------------------
   MEDIA OPS : delete / reorder / cover
------------------------------------------- */

export async function removeMediaFromPost(contentId: string, mediaId: string) {
  // supprime le lien
  await db
    .delete(contentMedia)
    .where(
      and(
        eq(contentMedia.contentId, contentId),
        eq(contentMedia.mediaId, mediaId)
      )
    );

  // recalcul cover si besoin
  const remaining = await db
    .select()
    .from(contentMedia)
    .where(eq(contentMedia.contentId, contentId))
    .orderBy(contentMedia.sortOrder);

  if (remaining.length === 0) return;

  // reset cover
  await db
    .update(contentMedia)
    .set({ isCover: false })
    .where(eq(contentMedia.contentId, contentId));

  // premier média restant devient cover
  await db
    .update(contentMedia)
    .set({ isCover: true })
    .where(eq(contentMedia.id, remaining[0].id));
}

export async function reorderPostMedia(contentId: string, orderedMediaIds: string[]) {
  const existing = await db
    .select()
    .from(contentMedia)
    .where(eq(contentMedia.contentId, contentId));

  const existingIds = existing.map(r => r.mediaId);

  if (existingIds.length !== orderedMediaIds.length) {
    throw new Error("INVALID_MEDIA_SET");
  }

  const setExisting = new Set(existingIds);
  const setIncoming = new Set(orderedMediaIds);

  if (setExisting.size !== setIncoming.size) {
    throw new Error("INVALID_MEDIA_SET");
  }

  for (const id of orderedMediaIds) {
    if (!setExisting.has(id)) {
      throw new Error("INVALID_MEDIA_SET");
    }
  }

  // update ordre
  for (let i = 0; i < orderedMediaIds.length; i++) {
    const mediaId = orderedMediaIds[i];

    await db
      .update(contentMedia)
      .set({ sortOrder: i })
      .where(
        and(
          eq(contentMedia.contentId, contentId),
          eq(contentMedia.mediaId, mediaId)
        )
      );
  }
}

export async function setPostCover(contentId: string, mediaId: string) {
  const existing = await db
    .select()
    .from(contentMedia)
    .where(
      and(
        eq(contentMedia.contentId, contentId),
        eq(contentMedia.mediaId, mediaId)
      )
    );

  if (existing.length === 0) {
    throw new Error("MEDIA_NOT_IN_POST");
  }

  await db
    .update(contentMedia)
    .set({ isCover: false })
    .where(eq(contentMedia.contentId, contentId));

  await db
    .update(contentMedia)
    .set({ isCover: true })
    .where(
      and(
        eq(contentMedia.contentId, contentId),
        eq(contentMedia.mediaId, mediaId)
      )
    );
}
