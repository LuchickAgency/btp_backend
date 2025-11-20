import { db } from "../db";
import { mediaAssets } from "../schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Supprime les médias d'un user en dépassant la limite donnée (ex: 500)
 */
export async function cleanOldMediaForUser(userId: string, limit = 500) {
  // récupérer les médias (les plus récents en premier)
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.ownerId, userId))
    .orderBy(mediaAssets.createdAt);

  if (rows.length <= limit) {
    return { removed: 0 };
  }

  const toDelete = rows.slice(0, rows.length - limit); // tous sauf les 500 derniers

  let removed = 0;

  for (const media of toDelete) {
    const url = media.url; // ex: /uploads/123.webp
    const fileName = url.split("/").pop();
    if (!fileName) continue;

    const uploadDir = process.env.UPLOAD_DIR!;
    const fullPath = path.join(uploadDir, fileName);

    // supprimer fichier local
    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (err) {
      console.warn("File deletion error:", err);
    }

    // supprimer entrée BDD
    await db
      .delete(mediaAssets)
      .where(eq(mediaAssets.id, media.id));

    removed++;
  }

  return { removed };
}

/**
 * Purge tous les users du système
 */
export async function cleanAllUsersMedias(limit = 500) {
  const all = await db
    .select({
      ownerId: mediaAssets.ownerId,
    })
    .from(mediaAssets);

  const uniqueOwners = Array.from(new Set(all.map(a => a.ownerId)));

  let totalRemoved = 0;

  for (const ownerId of uniqueOwners) {
    const { removed } = await cleanOldMediaForUser(ownerId, limit);
    totalRemoved += removed;
  }

  return { totalRemoved, users: uniqueOwners.length };
}
