/**
 * Update data/coverage.json with current database statistics.
 *
 * Preserves hand-maintained schema fields (schema_version, mcp_type,
 * scope_statement, scope_exclusions, gaps, per-source fixed metadata like
 * url/authority/id/name/completeness, etc.) and only refreshes the dynamic
 * counts, count-derived notes, and timestamps. Runs safely on CI without
 * clobbering docs.
 *
 * Usage:
 *   npx tsx scripts/update-coverage.ts
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env["RBI_DB_PATH"] ?? "data/rbi.db";
const COVERAGE_FILE = "data/coverage.json";

async function main(): Promise<void> {
  if (!existsSync(DB_PATH)) {
    console.error(`Database not found: ${DB_PATH}`);
    console.error("Run: npm run seed  or  npm run build:db");
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });

  const frameworks = (db.prepare("SELECT COUNT(*) AS n FROM frameworks").get() as { n: number }).n;
  const controls = (db.prepare("SELECT COUNT(*) AS n FROM controls").get() as { n: number }).n;
  const circulars = (db.prepare("SELECT COUNT(*) AS n FROM circulars").get() as { n: number }).n;

  // Count by source (pdf_url), not by DB classification table.
  const fromMdIndexFrameworks = (db.prepare(
    "SELECT COUNT(*) AS n FROM frameworks WHERE pdf_url LIKE '%BS_ViewMasDirections%'",
  ).get() as { n: number }).n;
  const fromMdIndexCirculars = (db.prepare(
    "SELECT COUNT(*) AS n FROM circulars WHERE pdf_url LIKE '%BS_ViewMasDirections%'",
  ).get() as { n: number }).n;
  const fromNotifFrameworks = (db.prepare(
    "SELECT COUNT(*) AS n FROM frameworks WHERE pdf_url LIKE '%NotificationUser%'",
  ).get() as { n: number }).n;
  const fromNotifCirculars = (db.prepare(
    "SELECT COUNT(*) AS n FROM circulars WHERE pdf_url LIKE '%NotificationUser%'",
  ).get() as { n: number }).n;

  const masterDirectionsCount = fromMdIndexFrameworks + fromMdIndexCirculars;
  const notificationsCount = fromNotifFrameworks + fromNotifCirculars;

  const existing: Record<string, unknown> = existsSync(COVERAGE_FILE)
    ? JSON.parse(readFileSync(COVERAGE_FILE, "utf8"))
    : {};

  // Per-source update: use source.id to decide which DB count to apply.
  // Keep all hand-authored metadata (url, authority, name, completeness, etc.).
  // Refresh the count-bearing `notes` string since it embeds live counts.
  const sources =
    Array.isArray(existing["sources"]) && existing["sources"].length > 0
      ? (existing["sources"] as Record<string, unknown>[]).map((s) => {
          const id = s["id"];
          if (id === "rbi-notifications") {
            return {
              ...s,
              item_count: notificationsCount,
              expected_items:
                typeof s["expected_items"] === "number"
                  ? s["expected_items"]
                  : notificationsCount,
              notes:
                "~3,100 circulars scanned across 2015-2026; " +
                `${notificationsCount} survived cyber keyword filter and are stored ` +
                `across the frameworks (${fromNotifFrameworks}) and circulars ` +
                `(${fromNotifCirculars}) tables by classifyDocument().`,
            };
          }
          if (id === "rbi-master-directions") {
            return {
              ...s,
              item_count: masterDirectionsCount,
              expected_items:
                typeof s["expected_items"] === "number"
                  ? s["expected_items"]
                  : masterDirectionsCount,
              notes:
                "RBI portal lists ~344 active Master Directions in total; " +
                `${masterDirectionsCount} match the cyber/IT keyword filter. Stored ` +
                `across the frameworks (${fromMdIndexFrameworks}) and circulars ` +
                `(${fromMdIndexCirculars}) tables by classifyDocument(); the ` +
                "circulars-table MDs include flagship cyber documents (IDs 12032, " +
                "12562, 12702, 12703, 12704, 12715, 12898) whose titles do not " +
                "contain the keywords 'framework', 'standard', or 'guideline' that " +
                "trigger framework classification.",
            };
          }
          return s;
        })
      : [];

  const totalItems = frameworks + controls + circulars;
  const uniqueDocuments = masterDirectionsCount + notificationsCount;

  const existingSummary =
    (existing["summary"] as Record<string, unknown> | undefined) ?? {};
  const summary = {
    ...existingSummary,
    total_items: totalItems,
    total_sources: sources.length,
    unique_documents: uniqueDocuments,
    breakdown_note:
      `${uniqueDocuments} unique documents = ` +
      `${masterDirectionsCount} from Master Directions index + ` +
      `${notificationsCount} from Notifications portal (post cyber-filter, ` +
      `post dedup). Stored as ${frameworks} framework rows + ${circulars} ` +
      `circular rows + ${controls} control rows (one per framework, ` +
      `index-level only) = ${totalItems} total rows. ` +
      "The 'frameworks' vs 'circulars' split is classification by title " +
      "keyword, not by source.",
  };

  const coverage = {
    ...existing,
    sources,
    totals: { frameworks, controls, circulars },
    summary,
    generatedAt: new Date().toISOString(),
  };

  const dir = dirname(COVERAGE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  writeFileSync(COVERAGE_FILE, JSON.stringify(coverage, null, 2), "utf8");

  console.log(`Coverage updated: ${COVERAGE_FILE}`);
  console.log(`  Frameworks : ${frameworks}`);
  console.log(`  Controls   : ${controls}`);
  console.log(`  Circulars  : ${circulars}`);
  console.log(
    `  Schema fields preserved: scope_exclusions, per-source metadata (url/authority/completeness)`,
  );
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
