import { inngest } from "../client.js";
import { config } from "../../config.js";
import { createTicketSource } from "../../adapters/index.js";
import type { SerializedTicket } from "../../adapters/ticket-source.js";
import { reviveTickets } from "../../adapters/ticket-source.js";
import { classifyTickets, RuleBasedClassifier } from "../../lib/classify.js";
import type { SerializedDuplicateGroup } from "../../lib/dedupe.js";
import {
  duplicateIndex,
  findDuplicates,
  reviveDuplicateGroups,
} from "../../lib/dedupe.js";
import type { SerializedPrioritizedTicket } from "../../lib/prioritize.js";
import { prioritize, revivePrioritized } from "../../lib/prioritize.js";
import { buildReport } from "../../lib/report.js";
import { createNotifier } from "../../pipeline.js";

/**
 * Monday-morning backlog triage pre-read.
 *
 * Schedule: every Monday at 7:00 AM in the configured timezone
 * (Inngest cron supports the `TZ=` prefix; the timezone comes from
 * TRIAGE_TIMEZONE, default America/New_York).
 *
 * Each step.run() is durable: if the process crashes mid-step, Inngest
 * replays from the last completed step instead of starting over. The
 * function-level `retries: 3` applies to failed steps (e.g. the ticket
 * API flaking) with backoff.
 *
 * To trigger manually (e.g. from the Inngest dashboard), add an event
 * trigger: change the second argument to
 *   [{ event: "triage/pre-read.requested" }, { cron: "..." }]
 * and send that event. Cron-only keeps this simple by default.
 */
export const triagePreread = inngest.createFunction(
  { id: "backlog-triage-preread", retries: 3 },
  { cron: `TZ=${config.timezone} 0 7 * * 1` },
  async ({ step }) => {
    const now = new Date();
    const since = new Date(now.getTime() - config.lookbackDays * 86_400_000);
    const source = createTicketSource(config);

    // 1 — Fetch changed tickets. Retried on failure (network/auth flakes).
    // NOTE: step.run() JSON-serializes results, so Dates come back as
    // strings — reviveTickets() restores them before the next step.
    let tickets = reviveTickets(
      (await step.run("fetch-tickets", async () => {
        return source.listChangedTickets(since);
      })) as unknown as SerializedTicket[],
    );

    // Project filter (also applied in runPipeline for the mock runner).
    if (config.projectKeys.length > 0) {
      tickets = tickets.filter((t) =>
        config.projectKeys.some((k) => t.key.toUpperCase().startsWith(k)),
      );
    }

    // 2 — Classify into bug/feature/tech-debt/spike/support/chore.
    const classifications = await step.run("classify-tickets", async () => {
      // Swap RuleBasedClassifier for LLMClassifier (see src/lib/classify.ts)
      // when you want model-based classification.
      return classifyTickets(tickets, new RuleBasedClassifier());
    });

    // 3 — Flag likely duplicates.
    const duplicateGroups = reviveDuplicateGroups(
      (await step.run("dedupe-tickets", async () => {
        return findDuplicates(tickets, config.duplicateThreshold);
      })) as unknown as SerializedDuplicateGroup[],
    );
    const dupesOf = duplicateIndex(duplicateGroups);

    // 4 — Heuristic priority ranking with rationale.
    const ranked = revivePrioritized(
      (await step.run("prioritize-tickets", async () => {
        return prioritize(tickets, classifications, dupesOf);
      })) as unknown as SerializedPrioritizedTicket[],
    );

    // 5 — Build the markdown report.
    const report = await step.run("build-report", async () => {
      return buildReport({
        runDate: now.toISOString().slice(0, 10),
        windowLabel: `${since.toISOString().slice(0, 10)} → ${now.toISOString().slice(0, 10)}`,
        sourceName: source.name,
        ranked,
        duplicateGroups,
        totalFetched: tickets.length,
      });
    });

    // 6 — Deliver (console by default; see src/lib/notify.ts for
    // Slack/email/Notion TODOs).
    await step.run("deliver-report", async () => {
      await createNotifier().notify(report);
      return { delivered: true, ticketCount: tickets.length };
    });

    return {
      ticketCount: tickets.length,
      duplicateGroups: duplicateGroups.length,
      deliveredAt: now.toISOString(),
    };
  },
);
