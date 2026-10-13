/**
 * Pluggable notifier. The deliver step calls notify() with the finished
 * markdown report. Console is the default (works everywhere, great for the
 * mock run). Wire up the others with the TODOs below.
 */
export interface Notifier {
  readonly name: string;
  notify(reportMarkdown: string): Promise<void>;
}

/** Default: print the report to stdout. */
export class ConsoleNotifier implements Notifier {
  readonly name = "console";
  async notify(reportMarkdown: string): Promise<void> {
    console.log(reportMarkdown);
  }
}

/* ---------------------------------------------------------------------------
 * TODO: Slack — post the report to a channel.
 *   1. Create an incoming webhook: Slack → your workspace → Apps → Incoming
 *      Webhooks → add to a channel (e.g. #triage). Copy the webhook URL.
 *   2. Set SLACK_WEBHOOK_URL in your .env.
 *   3. Uncomment the class below and select it in src/inngest/functions/
 *      triage-preread.ts (see the deliver step).
 * ------------------------------------------------------------------------- */
// export class SlackNotifier implements Notifier {
//   readonly name = "slack";
//   constructor(private readonly webhookUrl: string) {}
//   async notify(reportMarkdown: string): Promise<void> {
//     // FILL-IN: Slack's chat.postMessage / incoming-webhook format.
//     // Incoming webhooks accept { text } — keep it under ~40k chars,
//     // or split into blocks. Convert markdown minimally (Slack uses mrkdwn).
//     const res = await fetch(this.webhookUrl, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ text: reportMarkdown.slice(0, 39000) }),
//     });
//     if (!res.ok) throw new Error(`Slack webhook failed: ${res.status}`);
//   }
// }

/* ---------------------------------------------------------------------------
 * TODO: Email — send the report to the triage attendees.
 *   1. Pick a sender: Resend (npm i resend), Postmark, or your company's SMTP.
 *   2. Set the API key + REPORT_EMAIL_TO (comma-separated) in your .env.
 *   3. Uncomment the class below and select it in the deliver step.
 * ------------------------------------------------------------------------- */
// export class EmailNotifier implements Notifier {
//   readonly name = "email";
//   constructor(
//     private readonly apiKey: string,
//     private readonly to: string[],
//   ) {}
//   async notify(reportMarkdown: string): Promise<void> {
//     // FILL-IN: implement with your chosen provider, e.g.:
//     //   import { Resend } from "resend";
//     //   await new Resend(this.apiKey).emails.send({
//     //     from: "triage-bot@yourcompany.com", // FILL-IN: verified sender
//     //     to: this.to,
//     //     subject: `Backlog triage pre-read — ${new Date().toISOString().slice(0, 10)}`,
//     //     text: reportMarkdown,
//     //   });
//     throw new Error("EmailNotifier not implemented — see the TODO above.");
//   }
// }

/* ---------------------------------------------------------------------------
 * TODO: Notion — append the report to the triage database/page.
 *   1. Create a Notion integration at notion.so/my-integrations, copy the token.
 *   2. Share the target database/page with the integration.
 *   3. npm i @notionhq/client, then implement below (pages.create with the
 *      markdown converted to blocks, or append to a daily page).
 * ------------------------------------------------------------------------- */
