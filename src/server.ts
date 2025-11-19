import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth";
import profilesRoutes from "./routes/profiles";

import companyRoutes from "./routes/companies";
import companyAdminRequestRoutes from "./routes/companyAdminRequests";

import tagsRoutes from "./routes/tags";

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

// Import OK → NOM EXACT
import { runLegalAIWorker } from "./workers/legalAIWorker";

const app = express();
app.use(cors());
app.use(express.json());

/* ---------- PUBLIC API ---------- */
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

/* ---------- INTERNAL AUTOMATION ---------- */
// fusion propre → 1 seul préfixe
app.use("/internal/legal", internalLegalIngestRoutes);
app.use("/internal/ai", internalAIWorkerRoutes);

/* ---------- HEALTH ---------- */
app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

/* ---------- SERVER ---------- */
app.listen(3000, () => {
  console.log("🚀 API running on http://localhost:3000");
});

/* ---------- BACKGROUND WORKER (toutes les 5 minutes) ---------- */
setInterval(() => {
  runLegalAIWorker();
}, 5 * 60 * 1000);
