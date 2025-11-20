import { Router } from "express";
import { upload } from "../middleware/upload";
import { requireAuth } from "../middleware/requireAuth";
import { db } from "../db";
import { mediaAssets } from "../schema";
import { processImage, detectMediaType } from "../utils/media";
import crypto from "crypto";
import path from "path";
import type { File } from "multer";

import { Request } from "express";

interface MulterRequest extends Request {
  file: File;
  files?: File[];
}

const router = Router();

router.post("/", requireAuth, upload.single("file"), async (req: MulterRequest, res) => {
  try {
    const userId = (req as any).userId;
    const file = req.file;

    if (!file) return res.status(400).json({ error: "NO_FILE" });

    let filePath = file.path;

    // Traitement des images
    if (file.mimetype.startsWith("image/")) {
      filePath = await processImage(file.path);
    }

    const mime = file.mimetype;
    const type = detectMediaType(mime);

    const dbPath = filePath.replace(/\\/g, "/"); // windows safe

    const [asset] = await db
      .insert(mediaAssets)
      .values({
        id: crypto.randomUUID(),
        ownerId: userId,
        url: "/uploads/" + path.basename(dbPath),
        type,
        mimeType: mime,
        sizeBytes: file.size,
        createdAt: new Date(),
      })
      .returning();

    res.json(asset);
  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

export default router;
