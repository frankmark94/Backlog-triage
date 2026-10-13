/**
 * TicketSource — the "port" every backlog adapter implements.
 *
 * The pipeline only ever talks to this interface, never to a concrete
 * ticketing system. To support a new tool (Jira, Linear, Azure DevOps, …):
 *   1. Create src/adapters/<tool>.ts implementing TicketSource.
 *   2. Map the tool's native ticket shape onto the Ticket type below.
 *   3. Select it via TRIAGE_ADAPTER in src/adapters/index.ts.
 */

/** Canonical ticket shape used by the whole pipeline. */
export interface Ticket {
  /** Stable unique id in the source system, e.g. "a91f…" */
  id: string;
  /** Human key shown in reports, e.g. "MSG-1234" */
  key: string;
  title: string;
  /** Plain-text description; may be empty. */
  description: string;
  /** Raw status string from the source system, e.g. "In Progress" */
  status: string;
  /** Raw type string from the source system, e.g. "Bug", "Story" */
  type: string;
  /** Raw priority string, if the source system has one. */
  priority?: string;
  /** Labels/tags, lowercased by convention. */
  labels: string[];
  createdAt: Date;
  updatedAt: Date;
  reporter?: string;
  assignee?: string;
  /** Deep link to the ticket in the source system, for the report. */
  url?: string;
}

/**
 * A source of backlog tickets.
 *
 * listChangedTickets MUST return every ticket created or updated at/after
 * `since`, across all configured projects. Implementations should page
 * through the source API until exhausted and normalize each record onto
 * the Ticket shape above. Throw on auth/network errors — Inngest retries
 * the step that calls this.
 */
export interface TicketSource {
  /** Short identifier used in logs, e.g. "mock", "agile-studios". */
  readonly name: string;
  listChangedTickets(since: Date): Promise<Ticket[]>;
}

/**
 * Wire form of a Ticket after crossing a step.run() boundary: Inngest
 * serializes step results to JSON, so Dates come back as ISO strings.
 * Always revive with reviveTickets() before passing step output onward —
 * see the fetch/classify steps in triage-preread.ts.
 */
export type SerializedTicket = Omit<Ticket, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

export function reviveTicket(t: SerializedTicket): Ticket {
  return { ...t, createdAt: new Date(t.createdAt), updatedAt: new Date(t.updatedAt) };
}

export function reviveTickets(tickets: SerializedTicket[]): Ticket[] {
  return tickets.map(reviveTicket);
}
