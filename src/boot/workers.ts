import { runLegalAIWorker } from "../workers/legalAIWorker";
import { initMediaPurgeCron } from "../jobs/mediaPurgeJob";

export function bootWorkers() {
  console.log("🟢 Workers & Cron activés.");

  initMediaPurgeCron();

  setInterval(() => {
    runLegalAIWorker();
  }, 5 * 60 * 1000).unref();
}
