import type { SerializedTicket, Ticket } from "../adapters/ticket-source.js";
import { reviveTicket } from "../adapters/ticket-source.js";
import type { Classification, TicketCategory } from "./classify.js";

export interface PrioritizedTicket {
  ticket: Ticket;
  classification: Classification;
  /** 0–100. Higher = discuss earlier in triage. */
  score: number;
  /** Human-readable reasons, shown in the report. */
  rationale: string[];
  /** Set when dedupe flagged this as a duplicate of another ticket. */
  duplicateOf?: string;
}

interface Weights {
  /** Base score by normalized category. */
  category: Record<TicketCategory, number>;
  /** Extra points per matched label (substring match, case-insensitive). */
  labelSignals: { match: string; points: number; note: string }[];
  /** Extra points per priority string (substring match, case-insensitive). */
  prioritySignals: { match: string; points: number; note: string }[];
  /** Points per day of age, capped. */
  agePerDay: number;
  ageCap: number;
  /** Points if updated in the last 24h (fresh activity). */
  recentlyUpdated: number;
  /** Points if unassigned (needs an owner). */
  unassigned: number;
}

/**
 * Heuristic scoring — transparent on purpose: every point shows up in the
 * rationale so the PM can disagree with the math in triage. Tune the weights
 * below to match your team's actual priorities.
 */
export const DEFAULT_WEIGHTS: Weights = {
  category: {
    bug: 30,
    feature: 20,
    support: 25,
    spike: 15,
    "tech-debt": 10,
    chore: 5,
    unknown: 10,
  },
  labelSignals: [
    { match: "customer-escalation", points: 20, note: "customer escalation" },
    { match: "security", points: 20, note: "security-related" },
    { match: "compliance", points: 15, note: "compliance deadline" },
    { match: "pii", points: 10, note: "PII involved" },
    { match: "latency", points: 10, note: "latency/perf signal" },
  ],
  prioritySignals: [
    { match: "critical", points: 25, note: "marked Critical" },
    { match: "highest", points: 25, note: "marked Highest" },
    { match: "high", points: 15, note: "marked High" },
    { match: "blocker", points: 25, note: "marked Blocker" },
  ],
  agePerDay: 1,
  ageCap: 14,
  recentlyUpdated: 5,
  unassigned: 5,
};

const DAY_MS = 86_400_000;

export function prioritize(
  tickets: Ticket[],
  classifications: Classification[],
  dupesOf: Map<string, string>,
  weights: Weights = DEFAULT_WEIGHTS,
  now: Date = new Date(),
): PrioritizedTicket[] {
  const byKey = new Map(classifications.map((c) => [c.ticketKey, c]));

  const scored = tickets.map((t) => {
    const classification = byKey.get(t.key) ?? {
      ticketKey: t.key,
      category: "unknown" as TicketCategory,
      confidence: 0,
      method: "rules" as const,
    };
    const rationale: string[] = [];
    let score = weights.category[classification.category] ?? 10;
    rationale.push(
      `${classification.category} (+${weights.category[classification.category] ?? 10})`,
    );

    const labels = t.labels.map((l) => l.toLowerCase());
    for (const sig of weights.labelSignals) {
      if (labels.some((l) => l.includes(sig.match))) {
        score += sig.points;
        rationale.push(`${sig.note} (+${sig.points})`);
      }
    }

    const prio = (t.priority ?? "").toLowerCase();
    for (const sig of weights.prioritySignals) {
      if (prio.includes(sig.match)) {
        score += sig.points;
        rationale.push(`${sig.note} (+${sig.points})`);
        break; // count only the strongest priority signal
      }
    }

    const ageDays = Math.max(
      0,
      Math.floor((now.getTime() - t.createdAt.getTime()) / DAY_MS),
    );
    const agePts = Math.min(ageDays * weights.agePerDay, weights.ageCap);
    if (agePts > 0) {
      score += agePts;
      rationale.push(`${ageDays}d old (+${agePts})`);
    }

    if (now.getTime() - t.updatedAt.getTime() < DAY_MS) {
      score += weights.recentlyUpdated;
      rationale.push(`updated in last 24h (+${weights.recentlyUpdated})`);
    }

    if (!t.assignee || t.assignee.toLowerCase() === "unassigned") {
      score += weights.unassigned;
      rationale.push(`unassigned (+${weights.unassigned})`);
    }

    if (classification.confidence < 0.5) {
      rationale.push(`low classification confidence (${classification.confidence.toFixed(2)}) — verify in triage`);
    }

    const duplicateOf = dupesOf.get(t.key);

    return { ticket: t, classification, score, rationale, duplicateOf };
  });

  // Duplicates sink below their primary but stay visible; then sort by score.
  scored.sort((a, b) => {
    if (a.duplicateOf && !b.duplicateOf) return 1;
    if (!a.duplicateOf && b.duplicateOf) return -1;
    return b.score - a.score;
  });

  return scored;
}

/** Wire form of a PrioritizedTicket after a step.run() boundary. */
export type SerializedPrioritizedTicket = Omit<PrioritizedTicket, "ticket"> & {
  ticket: SerializedTicket;
};

/** Revive Dates in a ranked list coming back from step.run(). */
export function revivePrioritized(
  ranked: SerializedPrioritizedTicket[],
): PrioritizedTicket[] {
  return ranked.map((r) => ({ ...r, ticket: reviveTicket(r.ticket) }));
}
