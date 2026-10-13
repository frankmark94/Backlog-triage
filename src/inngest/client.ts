import { Inngest } from "inngest";

/**
 * Shared Inngest client. The `id` namespaces all functions and events for
 * this app in Inngest Cloud.
 *
 * Optional env:
 *   INNGEST_EVENT_KEY — required only when sending events TO Inngest Cloud
 *   from this process (not needed for cron-triggered functions).
 */
export const inngest = new Inngest({
  id: "backlog-triage-preread",
});
