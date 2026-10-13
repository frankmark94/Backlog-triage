import { AgileStudiosAdapter } from "./agile-studios.js";
import { MockTicketSource } from "./mock.js";
import type { TicketSource } from "./ticket-source.js";
import type { TriageConfig } from "../config.js";

/**
 * Selects the TicketSource implementation from config.
 * Add new adapters here as `case` branches (see ticket-source.ts).
 */
export function createTicketSource(cfg: TriageConfig): TicketSource {
  switch (cfg.adapter) {
    case "mock":
      return new MockTicketSource();
    case "agile-studios":
      return new AgileStudiosAdapter({
        // Validated non-empty by config.ts when adapter === "agile-studios".
        baseUrl: cfg.agileStudiosBaseUrl as string,
        apiToken: cfg.agileStudiosApiToken as string,
        projectKeys: cfg.projectKeys,
      });
    default:
      throw new Error(`Unknown TRIAGE_ADAPTER: ${cfg.adapter}`);
  }
}
