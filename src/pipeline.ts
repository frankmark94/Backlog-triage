import { createTicketSource } from "./adapters/index.js";
import type { TicketSource } from "./adapters/ticket-source.js";
import { classifyTickets, RuleBasedClassifier } from "./lib/classify.js";
import { duplicateIndex, findDuplicates } from "./lib/dedupe.js";
import { prioritize } from "./lib/prioritize.js";
import { buildReport } from "./lib/report.js";
import { ConsoleNotifier } from "./lib/notify.js";
import type { TriageConfig } from "./config.js";

/**
 * Pure pipeline stages. The Inngest function wraps each stage in step.run()
 * (durability + retries); the mock runner calls runPipeline() directly.
 * Keep stages free of Inngest imports so they stay testable anywhere.
 */
export interface PipelineResult {
  report: string;
  ticketCount: number;
  duplicateGroups: number;
}

export async function runPipeline(
  source: TicketSource,
  cfg: TriageConfig,
  now: Date = new Date(),
): Promise<PipelineResult> {
  const since = new Date(now.getTime() - cfg.lookbackDays * 86_400_000);

  // 1. Fetch
  let tickets = await source.listChangedTickets(since);
  if (cfg.projectKeys.length > 0) {
    tickets = tickets.filter((t) =>
      cfg.projectKeys.some((k) => t.key.toUpperCase().startsWith(k)),
    );
  }

  // 2. Classify (rule-based default; swap in LLMClassifier in classify.ts)
  const classifications = await classifyTickets(tickets, new RuleBasedClassifier());

  // 3. Dedupe
  const duplicateGroups = findDuplicates(tickets, cfg.duplicateThreshold);
  const dupesOf = duplicateIndex(duplicateGroups);

  // 4. Prioritize
  const ranked = prioritize(tickets, classifications, dupesOf);

  // 5. Report
  const windowLabel = `${since.toISOString().slice(0, 10)} → ${now.toISOString().slice(0, 10)}`;
  const report = buildReport({
    runDate: now.toISOString().slice(0, 10),
    windowLabel,
    sourceName: source.name,
    ranked,
    duplicateGroups,
    totalFetched: tickets.length,
  });

  return {
    report,
    ticketCount: tickets.length,
    duplicateGroups: duplicateGroups.length,
  };
}

/** Convenience: build the source from config and run. Used by run-mock.ts. */
export async function runPipelineFromConfig(cfg: TriageConfig): Promise<PipelineResult> {
  const source = createTicketSource(cfg);
  return runPipeline(source, cfg);
}

/** Default notifier for the deliver step (console). */
export function createNotifier() {
  // To use Slack/email/Notion instead, implement the TODO classes in
  // src/lib/notify.ts and return one here based on env config.
  return new ConsoleNotifier();
}
