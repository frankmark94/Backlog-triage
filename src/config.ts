import "dotenv/config";
import { z } from "zod";

/**
 * Env-driven configuration. Every knob the pipeline needs lives here so the
 * Inngest function, the mock runner, and future CLIs all read the same values.
 *
 * Copy .env.example to .env and adjust. All values have safe defaults except
 * the Agile Studios credentials, which are only required when
 * TRIAGE_ADAPTER=agile-studios.
 */
const ConfigSchema = z.object({
  /** "mock" runs the whole pipeline on sample data (no credentials). */
  adapter: z.enum(["mock", "agile-studios"]).default("mock"),
  timezone: z.string().default("America/New_York"),
  lookbackDays: z.coerce.number().int().min(1).max(90).default(7),
  /** Comma-separated project keys, e.g. "MSG,COB". Empty = no filtering. */
  projectKeys: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((k) => k.trim().toUpperCase())
        .filter(Boolean),
    ),
  /** Classifier confidence below this flags a ticket for human review. */
  minConfidence: z.coerce.number().min(0).max(1).default(0.5),
  /** Similarity at/above which two tickets count as likely duplicates. */
  duplicateThreshold: z.coerce.number().min(0).max(1).default(0.35),
  /** Only used by the Agile Studios adapter. */
  agileStudiosBaseUrl: z.string().optional(),
  agileStudiosApiToken: z.string().optional(),
});

export type TriageConfig = z.infer<typeof ConfigSchema>;

function loadConfig(): TriageConfig {
  const parsed = ConfigSchema.safeParse({
    adapter: process.env.TRIAGE_ADAPTER,
    timezone: process.env.TRIAGE_TIMEZONE,
    lookbackDays: process.env.TRIAGE_LOOKBACK_DAYS,
    projectKeys: process.env.TRIAGE_PROJECT_KEYS,
    minConfidence: process.env.TRIAGE_MIN_CONFIDENCE,
    duplicateThreshold: process.env.TRIAGE_DUPLICATE_THRESHOLD,
    agileStudiosBaseUrl: process.env.AGILE_STUDIOS_BASE_URL || undefined,
    agileStudiosApiToken: process.env.AGILE_STUDIOS_API_TOKEN || undefined,
  });

  if (!parsed.success) {
    // Fail fast with a readable message instead of blowing up mid-pipeline.
    throw new Error(
      `Invalid triage configuration:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n")}\nCheck your .env against .env.example.`,
    );
  }

  if (
    parsed.data.adapter === "agile-studios" &&
    (!parsed.data.agileStudiosBaseUrl || !parsed.data.agileStudiosApiToken)
  ) {
    throw new Error(
      "TRIAGE_ADAPTER=agile-studios requires AGILE_STUDIOS_BASE_URL and " +
        "AGILE_STUDIOS_API_TOKEN to be set. See .env.example and " +
        "src/adapters/agile-studios.ts for the setup checklist.",
    );
  }

  return parsed.data;
}

export const config: TriageConfig = loadConfig();
