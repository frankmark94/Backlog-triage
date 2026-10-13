# Architecture notes

## Why Inngest for this workload

A Monday-morning triage agent is a **durability** problem first, an LLM problem
second. The failure modes that kill unattended agents are boring ones:

- The ticket API flakes halfway through a fetch → you want a **retry with
  backoff**, not a dead cron email.
- The process crashes during classification → you want to **resume from the
  last completed step**, not re-fetch and re-classify everything.
- A step needs to wait (rate limits, human approval) → you want **sleep**,
  not a busy loop.

Inngest gives all three via `step.run()`:

1. **Durable steps.** Each step's return value is checkpointed. A crash or
   deploy mid-run replays from the last finished step — the fetch isn't
   repeated, the LLM isn't re-billed.
2. **Retries.** `retries: 3` on the function applies per-step with backoff.
   The `fetch-tickets` step is where this matters most (network + auth).
3. **Sleep / cron.** The `cron: "TZ=America/New_York 0 7 * * 1"` trigger is
   managed by Inngest Cloud — no cron host to babysit, no missed runs when
   the box reboots. `step.sleep_until()` is available if a future version
   needs "remind me the day before triage if the report looks thin."

The alternative (a plain cron job + script) works until the first 3am page.
Temporal is the heavier-duty answer for the same reasons; Inngest is the
version you can stand up in an afternoon, which is the right trade for a
PM-operated agent.

## The adapter pattern

The pipeline never imports a ticketing SDK directly — it talks only to the
`TicketSource` interface (`src/adapters/ticket-source.ts`):

```ts
interface TicketSource {
  readonly name: string;
  listChangedTickets(since: Date): Promise<Ticket[]>;
}
```

Rationale:

- **The ticket tool is the most likely thing to change** (internal tools get
  replaced; teams migrate Jira → Linear → whatever's next). The port keeps
  that churn in one file.
- **Testing without credentials.** The mock adapter lets the whole pipeline
  run in CI and locally. Every new adapter gets the same guarantee: implement
  the interface, run `npm run triage:mock` with it selected, eyeball the report.
- **Field vocabularies differ.** Statuses like "In Progress" vs "in_progress"
  vs "Doing" are kept as raw strings on `Ticket`; normalization happens in
  the classifier, where it's visible and testable.

## Extending dedupe with embeddings

The default dedupe is token-overlap Jaccard (`src/lib/dedupe.ts`) — zero
dependencies, catches "SMS delivery delayed" vs "SMS messages arriving very
late". It misses purely semantic duplicates ("texts are slow" vs "SMS
latency spike").

To upgrade:

1. `npm install` your embedding provider's SDK.
2. Precompute one embedding per ticket; cache keyed by `ticket.id` +
   `ticket.updatedAt` so unchanged tickets aren't re-embedded.
3. Replace the `similarity()` call in `findDuplicates()` with cosine
   similarity; re-tune the threshold (start around 0.82 for most models).
4. Keep Jaccard as the fallback path when the embedding call fails —
   dedupe degrading to "lexical only" beats dedupe failing entirely.

The `DuplicateGroup` / `duplicateIndex` shapes don't change, so the
prioritizer and report need no edits.

## Plugging in an LLM classifier

`src/lib/classify.ts` ships a deterministic rule-based classifier and an
`LLMClassifier` skeleton implementing the same `Classifier` interface.
Recommended rollout: rules first, LLM only for tickets where rule confidence
is below `TRIAGE_MIN_CONFIDENCE` — cheaper, faster, and the report already
flags low-confidence tickets for human review, so the LLM output lands where
a human is looking anyway.

## Promoting to production — checklist

- [ ] Complete the six Agile Studios TODOs (`src/adapters/agile-studios.ts`)
      and verify with `TRIAGE_ADAPTER=agile-studios npm run triage:mock`.
- [ ] Deploy `src/serve.ts` to a host (Fly.io / Railway / Render / K8s) and
      register the `/api/inngest` URL in Inngest Cloud → Apps.
- [ ] Set `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` from the Inngest
      dashboard as env vars on the host.
- [ ] Pick a real notifier (`src/lib/notify.ts`) — Slack webhook is the
      usual first choice for a team triage channel.
- [ ] Tune `DEFAULT_WEIGHTS` in `src/lib/prioritize.ts` after 2–3 real
      triages; the rationale lines make mis-scoring visible.
- [ ] Decide the duplicate threshold empirically: run the mock, then the real
      adapter, and adjust `TRIAGE_DUPLICATE_THRESHOLD` until the groups look
      right (default 0.35; lower if it's missing obvious dupes, raise if noisy).
- [ ] Add a dead-letter path: if `deliver-report` fails after retries,
      Inngest surfaces it in the dashboard — make sure someone watches it
      (or add a second notifier as fallback).
- [ ] Secrets: `.env` never committed; tokens live in the host's secret
      store, not in the repo.
