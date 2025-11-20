import sharp from "sharp";
import path from "path";
import fs from "fs";

export async function processImage(localPath: string) {
  // crée une version compressée WebP
  const dir = path.dirname(localPath);
  const base = path.basename(localPath, path.extname(localPath));

  const outputPath = path.join(dir, base + ".webp");

  await sharp(localPath)
    .resize(1920, 1920, { fit: "inside" }) // max 1920px
    .webp({ quality: 70 }) // compression propre
    .toFile(outputPath);

  // supprime l'original
  fs.unlinkSync(localPath);

  return outputPath;
}

export function detectMediaType(mime: string) {
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("video/")) return "VIDEO";
  return "FILE";
}
