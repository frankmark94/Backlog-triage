import "dotenv/config";
import { serve } from "inngest/express";
import express from "express";
import { inngest } from "./inngest/client.js";
import { triagePreread } from "./inngest/functions/triage-preread.js";

/* ---------------------------------------------------------------------------
 * Local + production HTTP host for the Inngest function.
 *
 * Local dev:
 *   1. npm run serve            (this file — serves :8288/api/inngest)
 *   2. npx inngest-cli@latest dev   (in another terminal; proxies to :8288)
 *   3. Trigger the function from the Inngest dev UI, or wait for the cron.
 *
 * Production on Inngest Cloud: deploy this handler to any host
 * (Fly.io, Railway, Render, your K8s cluster) and register the public URL
 * in Inngest Cloud → Apps.
 * ------------------------------------------------------------------------- */

const app = express();
app.use(express.json());

app.use(
  "/api/inngest",
  serve({ client: inngest, functions: [triagePreread] }),
);

const port = Number(process.env.PORT ?? 8288);
app.listen(port, () => {
  console.log(`[serve] Inngest handler listening on :${port}/api/inngest`);
});
