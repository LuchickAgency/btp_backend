import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { bootWorkers } from "./boot/workers";

const PORT = process.env.PORT || 3000;

/* ------------------------- WORKERS ------------------------- */
bootWorkers();

/* ------------------------- SERVER --------------------------- */
app.listen(PORT, () => {
  console.log(`🚀 API running on http://localhost:${PORT}`);
});
