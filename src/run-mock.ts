import "dotenv/config";
import { config } from "./config.js";
import { runPipelineFromConfig, createNotifier } from "./pipeline.js";

/**
 * Local end-to-end runner: executes the full triage pipeline against the
 * configured adapter and prints the markdown report to stdout.
 *
 *   npm run triage:mock        # uses the mock adapter (no credentials)
 *   TRIAGE_ADAPTER=agile-studios npm run triage:mock   # hits the real tool
 */
async function main(): Promise<void> {
  const { report, ticketCount, duplicateGroups } = await runPipelineFromConfig(config);

  // Deliver through the same notifier abstraction the Inngest function uses.
  await createNotifier().notify(report);

  console.error(
    `\n[done] ${ticketCount} tickets, ${duplicateGroups} duplicate group(s), adapter=${config.adapter}`,
  );
}

main().catch((err) => {
  console.error("[triage:mock] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
