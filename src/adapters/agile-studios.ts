import type { Ticket, TicketSource } from "./ticket-source.js";

/* ============================================================================
 * Agile Studios adapter — FILL IN THE TODOs BELOW, then set
 * TRIAGE_ADAPTER=agile-studios in your .env.
 *
 * CHECKLIST (do these in order):
 *  [ ] TODO-1: Set AGILE_STUDIOS_BASE_URL — the root URL of the Agile Studios
 *      API, e.g. "https://agile-studios.internal.example.com/api/v1".
 *      Ask your Agile Studios admin for the correct base URL.
 *  [ ] TODO-2: Create an API token — in Agile Studios go to
 *      Settings → API tokens → "Create token", give it read access to
 *      projects/issues, then set AGILE_STUDIOS_API_TOKEN in your .env.
 *  [ ] TODO-3: Confirm the auth scheme — replace the Authorization header in
 *      apiGet() below with whatever Agile Studios expects
 *      (Bearer token? `Token <value>`? API key query param?).
 *  [ ] TODO-4: Fill in the real endpoint paths — search this file for
 *      "FILL-IN:" comments. We deliberately did NOT invent endpoint paths;
 *      confirm each one against the Agile Studios API docs.
 *  [ ] TODO-5: Map fields — adjust mapToTicket() so every native field lands
 *      on the right Ticket property (status/type/priority vocabularies differ
 *      per tool; keep the raw strings, the classifier normalizes them).
 *  [ ] TODO-6: Handle pagination — confirm whether Agile Studios uses
 *      cursor, offset, or page-number pagination and wire it into
 *      listChangedTickets() (a skeleton loop is provided).
 * ========================================================================== */

interface AgileStudiosConfig {
  baseUrl: string;
  apiToken: string;
  projectKeys: string[];
}

export class AgileStudiosAdapter implements TicketSource {
  readonly name = "agile-studios";
  private readonly cfg: AgileStudiosConfig;

  constructor(cfg: AgileStudiosConfig) {
    // TODO-1: pass AGILE_STUDIOS_BASE_URL (no trailing slash) via config.ts —
    // it already reads the env var; just set it in your .env.
    this.cfg = {
      baseUrl: cfg.baseUrl.replace(/\/$/, ""),
      apiToken: cfg.apiToken,
      projectKeys: cfg.projectKeys,
    };
  }

  private async apiGet<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${this.cfg.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    // TODO-3: confirm the auth scheme with the Agile Studios API docs.
    // Common variants — keep exactly one:
    const headers: Record<string, string> = {
      // Option A (most common): "Authorization": `Bearer ${this.cfg.apiToken}`,
      // Option B: "Authorization": `Token ${this.cfg.apiToken}`,
      // Option C: "X-Api-Key": this.cfg.apiToken,
      Authorization: `Bearer ${this.cfg.apiToken}`,
      "Content-Type": "application/json",
    };

    const res = await fetch(url, { headers });
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "Agile Studios auth failed (401/403). Check AGILE_STUDIOS_API_TOKEN " +
          "and confirm the auth scheme in apiGet() (TODO-3).",
      );
    }
    if (!res.ok) {
      throw new Error(
        `Agile Studios request failed: ${res.status} ${res.statusText} for ${url.pathname}`,
      );
    }
    return (await res.json()) as T;
  }

  async listChangedTickets(since: Date): Promise<Ticket[]> {
    // FILL-IN (TODO-4): replace with the real Agile Studios search/list endpoint.
    // What you need from the API docs:
    //   - the endpoint path (e.g. SOMETHING like /issues/search — CONFIRM, do not guess)
    //   - the query params for "updated since" (ISO-8601 timestamp?) and project filter
    //   - the pagination mechanism (cursor? offset? page number?) — wire it into the loop below
    const SEARCH_PATH = "/FILL-IN/issues/search"; // <-- TODO-4: real path here

    const sinceIso = since.toISOString();
    const tickets: Ticket[] = [];

    // TODO-6: pagination skeleton — adapt to Agile Studios' real mechanism.
    // Replace the loop below once you know whether it uses cursor/offset/page.
    let page = 1;
    const pageSize = 100;
    for (;;) {
      // FILL-IN (TODO-4): replace param names with the real ones.
      const data = await this.apiGet<{
        items: unknown[]; // FILL-IN: real response envelope shape
        // FILL-IN: real pagination fields, e.g. nextCursor?: string; totalPages?: number;
      }>(SEARCH_PATH, {
        updated_since: sinceIso, // FILL-IN: real param name
        project_keys: this.cfg.projectKeys.join(","), // FILL-IN: real param name (omit if empty)
        page: String(page), // FILL-IN: adapt to cursor/offset if needed
        per_page: String(pageSize), // FILL-IN: real param name
      });

      for (const item of data.items ?? []) {
        tickets.push(this.mapToTicket(item));
      }

      // FILL-IN (TODO-6): real "are we done?" condition, e.g.
      //   if (!data.nextCursor) break;   — or —
      //   if ((data.items ?? []).length < pageSize) break;
      if ((data.items ?? []).length < pageSize) break;
      page += 1;
      if (page > 100) {
        throw new Error("Pagination safety limit hit (100 pages) — check TODO-6 wiring.");
      }
    }

    return tickets.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /**
   * TODO-5: map Agile Studios' native issue shape onto our Ticket type.
   * `raw` is `unknown` on purpose — replace the casts below with the real
   * field names from the API docs. Keep raw status/type/priority strings;
   * the classifier normalizes them.
   */
  private mapToTicket(raw: unknown): Ticket {
    const r = raw as Record<string, unknown>;
    const str = (v: unknown, fallback = "") =>
      typeof v === "string" ? v : fallback;

    // FILL-IN (TODO-5): replace each r.<field> with the real native field name.
    return {
      id: str(r["FILL-IN-id"]),
      key: str(r["FILL-IN-key"]),
      title: str(r["FILL-IN-title"]),
      description: str(r["FILL-IN-description"]),
      status: str(r["FILL-IN-status"], "Unknown"),
      type: str(r["FILL-IN-type"], "Unknown"),
      priority: str(r["FILL-IN-priority"]) || undefined,
      labels: Array.isArray(r["FILL-IN-labels"])
        ? (r["FILL-IN-labels"] as unknown[]).map((l) => String(l).toLowerCase())
        : [],
      createdAt: new Date(str(r["FILL-IN-createdAt"], new Date().toISOString())),
      updatedAt: new Date(str(r["FILL-IN-updatedAt"], new Date().toISOString())),
      reporter: str(r["FILL-IN-reporter"]) || undefined,
      assignee: str(r["FILL-IN-assignee"]) || undefined,
      url: str(r["FILL-IN-url"]) || undefined,
    };
  }
}
