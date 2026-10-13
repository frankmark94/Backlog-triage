import type { Ticket } from "../adapters/ticket-source.js";

/** Normalized categories the triage pipeline reasons about. */
export type TicketCategory =
  | "bug"
  | "feature"
  | "tech-debt"
  | "spike"
  | "support"
  | "chore"
  | "unknown";

export interface Classification {
  ticketKey: string;
  category: TicketCategory;
  /** 0–1. Below config.minConfidence the report flags the ticket for review. */
  confidence: number;
  method: "rules" | "llm";
}

/**
 * Pluggable classifier interface. The default is rule-based (no API keys,
 * deterministic, runs offline). To use an LLM instead, implement this
 * interface and pass it to classifyTickets() — see the LLMClassifier
 * skeleton at the bottom of this file.
 */
export interface Classifier {
  classify(tickets: Ticket[]): Promise<Classification[]>;
}

interface Rule {
  category: TicketCategory;
  confidence: number;
  /** matched against type/title/description/labels (case-insensitive) */
  patterns: RegExp[];
}

const RULES: Rule[] = [
  {
    category: "bug",
    confidence: 0.9,
    patterns: [
      /\bbug\b/i,
      /\bdefect\b/i,
      /\bbroken\b/i,
      /\bcrash(es|ed|ing)?\b/i,
      /\bfail(s|ed|ing|ure)?\b/i,
      /\berror\b/i,
      /\bstuck\b/i,
      /\bdrops?\b/i,
      /\bnever\b.*\b(complet|finish|arriv)/i,
      /\bnot working\b/i,
    ],
  },
  {
    category: "feature",
    confidence: 0.85,
    patterns: [
      /\bstory\b/i,
      /\bfeature\b/i,
      /\badd\b/i,
      /\bparity\b/i,
      /\brequest\b/i,
      /\bsupport for\b/i,
    ],
  },
  {
    category: "tech-debt",
    confidence: 0.9,
    patterns: [/\btech debt\b/i, /\brefactor\b/i, /\bmigrate\b/i, /\blegacy\b/i, /\bdeprecat/i],
  },
  {
    category: "spike",
    confidence: 0.95,
    patterns: [/\bspike\b/i, /\btime-?box/i, /\bevaluat/i, /\bprototype\b/i, /\bresearch\b/i],
  },
  {
    category: "support",
    confidence: 0.85,
    patterns: [/\bsupport ticket\b/i, /\bcustomer reports?\b/i, /\bescalation\b/i],
  },
  {
    category: "chore",
    confidence: 0.9,
    patterns: [/\bchore\b/i, /\bdependency\b/i, /\bdependency bump\b/i, /\broutine\b/i, /\bupdate .* sdk\b/i],
  },
];

/** Deterministic, dependency-free default. No network calls. */
export class RuleBasedClassifier implements Classifier {
  async classify(tickets: Ticket[]): Promise<Classification[]> {
    return tickets.map((t) => this.classifyOne(t));
  }

  private classifyOne(t: Ticket): Classification {
    const haystack = `${t.type}\n${t.title}\n${t.description}\n${t.labels.join(" ")}`;
    let best: { category: TicketCategory; confidence: number; hits: number } | null =
      null;

    for (const rule of RULES) {
      const hits = rule.patterns.filter((p) => p.test(haystack)).length;
      if (hits > 0 && (!best || hits > best.hits)) {
        best = { category: rule.category, confidence: rule.confidence, hits };
      }
    }

    if (!best) {
      return { ticketKey: t.key, category: "unknown", confidence: 0.3, method: "rules" };
    }
    // Slightly discount when only one weak pattern matched.
    const confidence = best.hits === 1 ? Math.min(best.confidence, 0.7) : best.confidence;
    return { ticketKey: t.key, category: best.category, confidence, method: "rules" };
  }
}

/* ---------------------------------------------------------------------------
 * LLMClassifier — PLUG-IN POINT.
 *
 * To classify with an LLM instead of (or in addition to) rules:
 *   1. npm install your provider SDK (e.g. `npm i openai` or `@anthropic-ai/sdk`).
 *   2. Implement classify() below: send each ticket's title+description with a
 *      system prompt that forces a JSON response shaped like Classification
 *      (category from the TicketCategory union, confidence 0-1).
 *   3. Set method: "llm" on the results.
 *   4. In pipeline.ts, swap `new RuleBasedClassifier()` for your class.
 *
 * Recommended pattern: run the rule-based classifier first and only call the
 * LLM for tickets where confidence < config.minConfidence (cheaper, faster).
 * ------------------------------------------------------------------------- */
export class LLMClassifier implements Classifier {
  constructor(
    // FILL-IN: e.g. private client: OpenAI — add the SDK import + API key env var.
    private readonly fallback: Classifier = new RuleBasedClassifier(),
  ) {}

  async classify(tickets: Ticket[]): Promise<Classification[]> {
    // FILL-IN: implement the LLM call here. Until then, delegate to rules
    // so the pipeline keeps working.
    //
    // Sketch:
    //   const prompt = (t: Ticket) =>
    //     `Classify this backlog ticket as one of: bug, feature, tech-debt,
    //      spike, support, chore, unknown. Reply with JSON only:
    //      {"category": "...", "confidence": 0.0-1.0}\n\n` +
    //     `Title: ${t.title}\nType: ${t.type}\nDescription: ${t.description}`;
    //   ... call the model, JSON.parse, map onto Classification with method: "llm".
    return this.fallback.classify(tickets);
  }
}

/** Batch entry point used by the pipeline (and the Inngest classify step). */
export async function classifyTickets(
  tickets: Ticket[],
  classifier: Classifier = new RuleBasedClassifier(),
): Promise<Classification[]> {
  return classifier.classify(tickets);
}
