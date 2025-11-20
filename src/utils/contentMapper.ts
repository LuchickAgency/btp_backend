import { getContentMedia } from "../services/contentService";

export async function enrichContentWithMedia(post: any) {
  const medias = await getContentMedia(post.id);
  return { ...post, media: medias };
}

export async function enrichContentArray(rows: any[]) {
  const enriched = [];
  for (const row of rows) {
    enriched.push(await enrichContentWithMedia(row));
  }
  return enriched;
}
