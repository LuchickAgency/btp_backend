import cron from "node-cron";
import { cleanAllUsersMedias } from "../services/mediaCleaner";

/**
 * Cron mensuel : 1er du mois à 04h00
 */
export function initMediaPurgeCron() {
  cron.schedule("0 4 1 * *", async () => {
    console.log("[CRON] Starting media purge job…");

    try {
      const result = await cleanAllUsersMedias(500);
      console.log(
        `[CRON] Media purge complete. Removed ${result.totalRemoved} files across ${result.users} users.`
      );
    } catch (err) {
      console.error("[CRON] Media purge error:", err);
    }
  });

  console.log("[CRON] Media purge cron scheduled (1st of month @ 04:00)");
}
