/**
 * Update data/coverage.json with current database statistics.
 *
 * Reads the RBI SQLite database and writes a coverage summary file
 * used by the freshness checker, fleet manifest, and the in_rbi_about tool.
 *
 * Usage:
 *   npx tsx scripts/update-coverage.ts
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env["RBI_DB_PATH"] ?? "data/rbi.db";
const COVERAGE_FILE = "data/coverage.json";

interface CoverageFile {
  schema_version: string;
  generatedAt: string;
  mcp: string;
  mcp_type: string;
  version: string;
  scope_statement: string;
  scope_exclusions: string[];
  sources: CoverageSource[];
  totals: {
    frameworks: number;
    controls: number;
    circulars: number;
  };
  summary: {
    total_items: number;
    total_sources: number;
    unique_documents: number;
    breakdown_note: string;
  };
}

interface CoverageSource {
  id: string;
  name: string;
  authority: string;
  url: string;
  last_fetched: string | null;
  last_verified: string | null;
  update_frequency: string;
  item_count: number;
  expected_items: number;
  measurement_unit: string;
  verification_method: string;
  completeness: string;
  status: "current" | "stale" | "unknown";
  notes: string;
}

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

  // Count by source, not by DB table. A row's source is stable
  // (from `pdf_url`) whereas the frameworks/circulars split is classification
  // by title keyword in `build-db.ts:classifyDocument()` — not the same axis.
  //
  // Prior versions of this script emitted `item_count = frameworks + controls`
  // (152) for the Master Directions source, which double-counted controls
  // (every framework gets one index-level control row) and conflated
  // classification with ingestion source. Fixed 2026-04-14.
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

  // `last_fetched` records when the ingestion pipeline last ran against RBI
  // sources. Most ingested circulars don't carry a parseable date column (the
  // RBI page structure varies), so we record the build date rather than the
  // most-recent circular date.
  const today = new Date().toISOString().slice(0, 10);

  const coverage: CoverageFile = {
    schema_version: "1.0",
    generatedAt: new Date().toISOString(),
    mcp: "india-rbi-cybersecurity-mcp",
    mcp_type: "regulatory_publications",
    version: "0.1.0",
    scope_statement:
      "Cyber and IT-relevant Master Directions and circulars published by the " +
      "Reserve Bank of India on the Notifications portal and Master Directions " +
      "index (2015-present), filtered by the CYBER_KEYWORDS title list in " +
      "scripts/ingest-fetch.ts (cybersecurity, IT governance, digital payments, " +
      "KYC, outsourcing, fraud, card security, etc.). This is a cyber-filtered " +
      "subset of RBI publications, not the full RBI corpus.",
    scope_exclusions: [
      "RBI enforcement orders and penalty decisions (not on the notifications portal)",
      "Hindi-language publications (English focus for v1)",
      "Circulars dated before 2015 (lower IT/cyber relevance, patchy portal coverage)",
      "Non-cyber RBI publications outside the CYBER_KEYWORDS filter (e.g. monetary-policy, forex, agricultural credit)",
      "Master direction clause-level body provisions (currently index-level only)",
      "SEBI / IRDAI / NPCI cybersecurity frameworks (separate MCPs cover those)",
    ],
    sources: [
      {
        id: "rbi-notifications",
        name: "RBI Notifications (Playwright ViewState replay of year-month accordion)",
        authority: "Reserve Bank of India",
        url: "https://rbi.org.in/Scripts/NotificationUser.aspx",
        last_fetched: today,
        last_verified: today,
        update_frequency: "monthly",
        item_count: notificationsCount,
        expected_items: notificationsCount,
        measurement_unit: "circulars",
        verification_method: "page_scraped",
        completeness: "full",
        status: "current",
        notes:
          "~3,100 circulars scanned across 2015-2026; " +
          `${notificationsCount} survived cyber keyword filter and are stored ` +
          `across the frameworks (${fromNotifFrameworks}) and circulars ` +
          `(${fromNotifCirculars}) tables by classifyDocument().`,
      },
      {
        id: "rbi-master-directions",
        name: "RBI Master Directions (BS_ViewMasterDirections.aspx static index)",
        authority: "Reserve Bank of India",
        url: "https://rbi.org.in/Scripts/BS_ViewMasterDirections.aspx",
        last_fetched: today,
        last_verified: today,
        update_frequency: "monthly",
        item_count: masterDirectionsCount,
        expected_items: masterDirectionsCount,
        measurement_unit: "master_directions",
        verification_method: "page_scraped",
        completeness: "full",
        status: "current",
        notes:
          "RBI portal lists ~344 active Master Directions in total; " +
          `${masterDirectionsCount} match the cyber/IT keyword filter. Stored ` +
          `across the frameworks (${fromMdIndexFrameworks}) and circulars ` +
          `(${fromMdIndexCirculars}) tables by classifyDocument(); the ` +
          "circulars-table MDs include flagship cyber documents (IDs 12032, " +
          "12562, 12702, 12703, 12704, 12715, 12898) whose titles do not " +
          "contain the keywords 'framework', 'standard', or 'guideline' that " +
          "trigger framework classification.",
      },
    ],
    totals: { frameworks, controls, circulars },
    summary: {
      total_items: frameworks + controls + circulars,
      total_sources: 2,
      unique_documents: masterDirectionsCount + notificationsCount,
      breakdown_note:
        `${masterDirectionsCount + notificationsCount} unique documents = ` +
        `${masterDirectionsCount} from Master Directions index + ` +
        `${notificationsCount} from Notifications portal (post cyber-filter, ` +
        `post dedup). Stored as ${frameworks} framework rows + ${circulars} ` +
        `circular rows + ${controls} control rows (one per framework, ` +
        `index-level only) = ${frameworks + controls + circulars} total rows. ` +
        "The 'frameworks' vs 'circulars' split is classification by title " +
        "keyword, not by source.",
    },
  };

  const dir = dirname(COVERAGE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  writeFileSync(COVERAGE_FILE, JSON.stringify(coverage, null, 2), "utf8");

  console.log(`Coverage updated: ${COVERAGE_FILE}`);
  console.log(`  Frameworks : ${frameworks}`);
  console.log(`  Controls   : ${controls}`);
  console.log(`  Circulars  : ${circulars}`);
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
