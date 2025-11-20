import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth";
import profilesRoutes from "./routes/profiles";
import tagsRoutes from "./routes/tags";
import companyRoutes from "./routes/companies";
import companyAdminRequestRoutes from "./routes/companyAdminRequests";
import contentRoutes from "./routes/content";
import workRequestsRoutes from "./routes/workRequests";
import workProposalsRoutes from "./routes/workProposals";
import jobRoutes from "./routes/jobs";
import tenderRoutes from "./routes/tenders";
import commentsRoutes from "./routes/comments";
import companyRatingsRoutes from "./routes/companyRatings";
import legalArticlesRoutes from "./routes/legalArticles";
import internalLegalIngestRoutes from "./routes/internalLegalIngest";
import internalAIWorkerRoutes from "./routes/internalAIWorker";
import searchRoutes from "./routes/search";
import dmConversationsRoutes from "./routes/dmConversations";
import dmMessagesRoutes from "./routes/dmMessages";
import uploadRoutes from "./routes/upload";

/* ---------------------------------------------------------
   CACHE GLOBAL POUR /content (simple + performant)
--------------------------------------------------------- */
export const contentCache = {
  key: null as string | null,
  data: null as any,
  timestamp: 0,
  ttl: 30_000, // 30s
};

/* Génère une clé basée sur les filtres */
export function makeCacheKey(query: any) {
  return JSON.stringify({
    type: query.type ?? null,
    tagIds: query.tagIds ?? null,
    companyId: query.companyId ?? null,
    authorId: query.authorId ?? null,
    search: query.search ?? null,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
  });
}

/* Vérifie si le cache est valide */
export function getCachedContent(key: string) {
  if (
    contentCache.key === key &&
    Date.now() - contentCache.timestamp < contentCache.ttl
  ) {
    return contentCache.data;
  }
  return null;
}

/* Enregistre le résultat */
export function setCachedContent(key: string, data: any) {
  contentCache.key = key;
  contentCache.data = data;
  contentCache.timestamp = Date.now();
}

/* Vide le cache */
export function clearContentCache() {
  contentCache.key = null;
  contentCache.data = null;
  contentCache.timestamp = 0;
}

const app = express();
app.use(cors());
app.use(express.json());

/* ROUTES */
app.use("/auth", authRoutes);
app.use("/profiles", profilesRoutes);
app.use("/tags", tagsRoutes);
app.use("/companies", companyRoutes);
app.use("/companies/admin-requests", companyAdminRequestRoutes);
app.use("/content", contentRoutes);
app.use("/work-requests", workRequestsRoutes);
app.use("/work-proposals", workProposalsRoutes);
app.use("/jobs", jobRoutes);
app.use("/tenders", tenderRoutes);
app.use("/comments", commentsRoutes);
app.use("/company-ratings", companyRatingsRoutes);
app.use("/legal-articles", legalArticlesRoutes);
app.use("/internal/legal", internalLegalIngestRoutes);
app.use("/internal/ai", internalAIWorkerRoutes);
app.use("/search", searchRoutes);
app.use("/dm/conversations", dmConversationsRoutes);
app.use("/dm/messages", dmMessagesRoutes);
app.use("/uploads", express.static(process.env.UPLOAD_DIR!));
app.use("/upload", uploadRoutes);

/* HEALTH */
app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

export default app;
