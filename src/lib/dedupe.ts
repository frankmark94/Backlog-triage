import type { SerializedTicket, Ticket } from "../adapters/ticket-source.js";
import { reviveTicket } from "../adapters/ticket-source.js";

export interface DuplicateCandidate {
  ticket: Ticket;
  /** 0–1 token-overlap similarity against the group primary. */
  similarity: number;
}

export interface DuplicateGroup {
  /** The oldest ticket in the group — the canonical one to keep. */
  primary: Ticket;
  duplicates: DuplicateCandidate[];
}

/* ---------------------------------------------------------------------------
 * Lightweight near-duplicate detection: tokenize title+description, drop
 * stopwords, compute Jaccard similarity. No dependencies, no API calls.
 *
 * EXTENSION POINT (embeddings): for semantic duplicates that share no words
 * ("SMS late" vs "text messages delayed"), swap `similarity()` for cosine
 * similarity over embeddings:
 *   1. npm install your embedding SDK.
 *   2. Precompute one embedding per ticket (cache by ticket id + updatedAt).
 *   3. Replace the Jaccard call in findDuplicates() with cosine similarity
 *      and re-tune the threshold (start ~0.82 for most embedding models).
 * Keep Jaccard as the fallback when the embedding service is unreachable.
 * ------------------------------------------------------------------------- */

const STOPWORDS = new Set(
  "a an the and or but of to in on for with is are was were be been by at from as it its this that these those we our you your they their he she his her them then than so such no not only also very can will just into over after before between during under again once here there when where which who whom whose what how all any both each few more most other some such only own same so than too very s t can will just don should now".split(
    " ",
  ),
);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      .map(stem),
  );
}

/**
 * Tiny stemmer — strips common English suffixes so "approval"/"approvals"
 * and "delayed"/"delay" count as the same token. Not a real Porter
 * stemmer; good enough for duplicate detection, dependency-free.
 */
function stem(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.endsWith("es") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);
  if (w.endsWith("ed") && w.length > 4) return w.slice(0, -2);
  return w;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

/**
 * Combined similarity: titles carry most of the signal (0.6), full text
 * backs it up (0.4). Plus a cross-reference boost: if either ticket's text
 * mentions the other's key (e.g. "same root cause as MSG-1042"), treat as
 * near-certain duplicate — people cite the ticket they think it dupes.
 */
export function similarity(a: Ticket, b: Ticket): number {
  const titleSim = jaccard(tokens(a.title), tokens(b.title));
  const fullSim = jaccard(
    tokens(`${a.title} ${a.description}`),
    tokens(`${b.title} ${b.description}`),
  );
  let sim = 0.6 * titleSim + 0.4 * fullSim;

  const aText = `${a.title} ${a.description}`.toLowerCase();
  const bText = `${b.title} ${b.description}`.toLowerCase();
  if (
    aText.includes(b.key.toLowerCase()) ||
    bText.includes(a.key.toLowerCase())
  ) {
    sim = Math.max(sim, 0.8);
  }
  return sim;
}

/**
 * Groups tickets whose pairwise similarity meets `threshold`.
 * Each ticket appears in at most one group; the oldest ticket is primary.
 */
export function findDuplicates(
  tickets: Ticket[],
  threshold = 0.55,
): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const assigned = new Set<string>();

  const sorted = [...tickets].sort(
    (x, y) => x.createdAt.getTime() - y.createdAt.getTime(),
  );

  for (const candidate of sorted) {
    if (assigned.has(candidate.id)) continue;

    const dupes: DuplicateCandidate[] = [];
    for (const other of sorted) {
      if (other.id === candidate.id || assigned.has(other.id)) continue;
      const sim = similarity(candidate, other);
      if (sim >= threshold) {
        dupes.push({ ticket: other, similarity: sim });
        assigned.add(other.id);
      }
    }

    if (dupes.length > 0) {
      assigned.add(candidate.id);
      dupes.sort((x, y) => y.similarity - x.similarity);
      groups.push({ primary: candidate, duplicates: dupes });
    }
  }

  return groups;
}

/** Map of duplicate ticket key -> primary ticket key, for the report/prioritizer. */
export function duplicateIndex(groups: DuplicateGroup[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const g of groups) {
    for (const d of g.duplicates) idx.set(d.ticket.key, g.primary.key);
  }
  return idx;
}

/** Wire form of a DuplicateGroup after a step.run() boundary (Dates → strings). */
export interface SerializedDuplicateGroup {
  primary: SerializedTicket;
  duplicates: { ticket: SerializedTicket; similarity: number }[];
}

/** Revive Dates in a duplicate-group list coming back from step.run(). */
export function reviveDuplicateGroups(
  groups: SerializedDuplicateGroup[],
): DuplicateGroup[] {
  return groups.map((g) => ({
    primary: reviveTicket(g.primary),
    duplicates: g.duplicates.map((d) => ({
      ticket: reviveTicket(d.ticket),
      similarity: d.similarity,
    })),
  }));
}
