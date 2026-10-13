import type { Ticket, TicketSource } from "./ticket-source.js";

/**
 * MockTicketSource — realistic sample tickets so the entire pipeline runs
 * locally with zero credentials (`npm run triage:mock`).
 *
 * The data models a messaging-platform PM's backlog (Digital Messaging /
 * Co-Browse style work): bugs, feature requests, tech debt, a support
 * escalation, and — deliberately — two pairs of near-duplicate tickets so
 * the dedupe step has something to find.
 */
const NOW = Date.now();
const day = 86_400_000;
const d = (daysAgo: number) => new Date(NOW - daysAgo * day);

const TICKETS: Ticket[] = [
  {
    id: "t-1001",
    key: "MSG-1042",
    title: "WhatsApp template approval stuck in 'pending' for tenant Acme",
    description:
      "Customer reports WhatsApp message templates submitted 5 days ago are still showing pending approval. " +
      "Meta's API returns 200 but our webhook never fires. Suspect the approval-status poller stopped after the last deploy.",
    status: "To Do",
    type: "Bug",
    priority: "High",
    labels: ["customer-escalation", "whatsapp"],
    createdAt: d(6),
    updatedAt: d(1),
    reporter: "support-team",
    assignee: "unassigned",
    url: "https://example.internal/browse/MSG-1042",
  },
  {
    id: "t-1002",
    key: "MSG-1043",
    title: "WhatsApp template approvals never complete — webhook missing",
    description:
      "Multiple tenants seeing templates stuck pending. Looks like we stopped receiving the approval webhook from Meta " +
      "around the time of Thursday's release. Possibly the same root cause as MSG-1042.",
    status: "To Do",
    type: "Bug",
    priority: "High",
    labels: ["whatsapp"],
    createdAt: d(4),
    updatedAt: d(0.5),
    reporter: "oncall",
    url: "https://example.internal/browse/MSG-1043",
  },
  {
    id: "t-1003",
    key: "MSG-1038",
    title: "Add typing indicators to web messaging widget",
    description:
      "Parity request: mobile SDKs show typing indicators, the web widget does not. " +
      "Designs attached in Figma. Needed for the Q4 enterprise rollout.",
    status: "To Do",
    type: "Story",
    labels: ["web-widget", "parity"],
    createdAt: d(9),
    updatedAt: d(2),
    reporter: "pm",
    url: "https://example.internal/browse/MSG-1038",
  },
  {
    id: "t-1004",
    key: "MSG-1031",
    title: "SMS delivery delayed 10+ minutes during peak hours",
    description:
      "P99 SMS delivery latency spiked to 12 minutes between 2–4pm ET yesterday. " +
      "Carrier callbacks look healthy; suspect our outbound queue is backing up.",
    status: "In Progress",
    type: "Bug",
    priority: "Critical",
    labels: ["sms", "latency", "customer-escalation"],
    createdAt: d(3),
    updatedAt: d(0.2),
    reporter: "sre",
    assignee: "backend-team",
    url: "https://example.internal/browse/MSG-1031",
  },
  {
    id: "t-1005",
    key: "MSG-1044",
    title: "SMS messages arriving very late in the afternoon",
    description:
      "Support ticket: end users report SMS arriving 10-15 minutes late during afternoon peak. " +
      "Probably the same queue backup as MSG-1031 but filed separately by support.",
    status: "To Do",
    type: "Bug",
    labels: ["sms", "support"],
    createdAt: d(2),
    updatedAt: d(1),
    reporter: "support-team",
    url: "https://example.internal/browse/MSG-1044",
  },
  {
    id: "t-1006",
    key: "COB-220",
    title: "Co-Browse session drops when agent switches tabs in Safari",
    description:
      "Repro: Safari 17+, agent switches browser tab mid-session, the co-browse stream freezes " +
      "and never recovers. Works fine in Chrome. Affects ~8% of co-browse sessions.",
    status: "To Do",
    type: "Bug",
    priority: "Medium",
    labels: ["co-browse", "safari"],
    createdAt: d(12),
    updatedAt: d(5),
    reporter: "qa",
    url: "https://example.internal/browse/COB-220",
  },
  {
    id: "t-1007",
    key: "MSG-1019",
    title: "Migrate message archive jobs off legacy cron to Inngest",
    description:
      "Tech debt: the nightly archive jobs still run on the legacy cron host with no retries. " +
      "Move to durable steps so a failed archive run resumes instead of silently skipping a day.",
    status: "To Do",
    type: "Tech Debt",
    labels: ["tech-debt", "reliability"],
    createdAt: d(20),
    updatedAt: d(6),
    reporter: "backend-team",
    url: "https://example.internal/browse/MSG-1019",
  },
  {
    id: "t-1008",
    key: "MSG-1045",
    title: "Spike: evaluate conversation-level eval harness for deflection metrics",
    description:
      "Time-boxed to 3 days: prototype an eval harness that scores deflection on a sample of " +
      "production conversations, so we can compare model configs apples-to-apples.",
    status: "To Do",
    type: "Spike",
    labels: ["eval", "ai"],
    createdAt: d(1),
    updatedAt: d(1),
    reporter: "pm",
    url: "https://example.internal/browse/MSG-1045",
  },
  {
    id: "t-1009",
    key: "MSG-1027",
    title: "Security review: PII redaction in message search index",
    description:
      "Pen-test follow-up: message bodies are indexed for search before PII redaction runs. " +
      "Redact-then-index, or gate search behind the redaction pipeline. Compliance deadline end of quarter.",
    status: "To Do",
    type: "Task",
    priority: "High",
    labels: ["security", "compliance", "pii"],
    createdAt: d(15),
    updatedAt: d(4),
    reporter: "security-team",
    url: "https://example.internal/browse/MSG-1027",
  },
  {
    id: "t-1010",
    key: "MSG-1040",
    title: "Update Twilio SDK to v8 in mobile messaging service",
    description: "Routine dependency bump. Twilio SDK v8 has breaking changes in the callback signatures; " +
      "see the migration guide. Low risk, do it before the next release branch.",
    status: "To Do",
    type: "Chore",
    labels: ["dependencies"],
    createdAt: d(5),
    updatedAt: d(3),
    reporter: "backend-team",
    url: "https://example.internal/browse/MSG-1040",
  },
  {
    id: "t-1011",
    key: "MSG-1035",
    title: "Emoji reactions render as boxes on older Android WebViews",
    description: "Minor cosmetic issue on Android WebView < 110. Newer emoji codepoints have no glyph. " +
      "Consider a fallback font or stripping unsupported codepoints.",
    status: "To Do",
    type: "Bug",
    priority: "Low",
    labels: ["web-widget", "cosmetic"],
    createdAt: d(25),
    updatedAt: d(8), // outside the default 7-day lookback — exercises the `since` filter
    reporter: "qa",
    url: "https://example.internal/browse/MSG-1035",
  },
];

export class MockTicketSource implements TicketSource {
  readonly name = "mock";

  async listChangedTickets(since: Date): Promise<Ticket[]> {
    // Simulate a tiny bit of latency like a real API call.
    await new Promise((r) => setTimeout(r, 50));
    return TICKETS.filter(
      (t) => t.createdAt >= since || t.updatedAt >= since,
    ).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
}
