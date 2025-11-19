import { Router } from "express";
import { runLegalAIWorker } from "../workers/legalAIWorker";

const router = Router();

const KEY = process.env.INTERNAL_INGEST_KEY!;

router.post("/run-legal-worker", async (req, res) => {
  const key = req.headers["x-internal-key"];
  if (key !== KEY) return res.status(401).json({ error: "Unauthorized" });

  await runLegalAIWorker();
  res.json({ status: "done" });
});

export default router;
