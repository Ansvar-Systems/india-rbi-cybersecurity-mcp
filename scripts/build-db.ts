/**
 * Build the RBI SQLite database from fetched raw data.
 *
 * Reads .meta.json files from data/raw/, parses the extracted text,
 * and inserts frameworks, controls, and circulars into the database.
 *
 * Usage:
 *   npx tsx scripts/build-db.ts
 *   npx tsx scripts/build-db.ts --force   # drop and rebuild database
 *   npx tsx scripts/build-db.ts --dry-run # log what would be inserted
 */

import Database from "better-sqlite3";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { SCHEMA_SQL } from "../src/db.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DB_PATH = process.env["RBI_DB_PATH"] ?? "data/rbi.db";
const RAW_DIR = "data/raw";

const args = process.argv.slice(2);
const force = args.includes("--force");
const dryRun = args.includes("--dry-run");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FetchedDocument {
  title: string;
  url: string;
  category: string;
  filename: string;
  text: string;
  fetchedAt: string;
}

interface FrameworkRow {
  id: string;
  name: string;
  version: string | null;
  domain: string;
  description: string;
  control_count: number;
  effective_date: string | null;
  pdf_url: string;
}

interface ControlRow {
  framework_id: string;
  control_ref: string;
  domain: string;
  subdomain: string;
  title: string;
  description: string;
  maturity_level: string;
  priority: string;
}

interface CircularRow {
  reference: string;
  title: string;
  date: string | null;
  category: string;
  summary: string;
  full_text: string;
  pdf_url: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Cyber relevance filter (keep in sync with ingest-fetch.ts — defensive check
// that re-filters cached meta files on every DB build so unrelated titles
// fetched under an older keyword list don't leak into the circulars table).
// ---------------------------------------------------------------------------

const CYBER_KEYWORDS = [
  "cybersecurity", "cyber security", "cyber", "information security",
  "information technology", "it governance", "it security", "cloud computing",
  "cloud adoption", "digital payment", "digital lending", "digital banking",
  "business continuity", "outsourcing", "fintech", "data protection",
  "incident", "vulnerability", "mobile banking", "internet banking", "fraud",
  "cert-in", "payment security", "card transaction", "card-on-file",
  "tokenisation", "tokenization", "virtual currenc", "crypto",
  "atm ", "atms", "pos ", "contactless card", "e-mandate", "unified payment", "upi",
  "know your customer", "kyc", "digital banking channel", "credit card",
  "debit card", "credit information reporting", "issuance and conduct",
  "aadhaar", "biometric", "authentication mechanism",
];

const ANTI_KEYWORDS = [
  "wilful defaulters", "large defaulters", "exposure norms",
  "sovereign gold bond", "line of credit", "lead bank",
  "kisan credit card", "interest subvention", "agriculture and allied activities",
];

function isCyberRelevant(title: string): boolean {
  const t = title.toLowerCase();
  if (ANTI_KEYWORDS.some((k) => t.includes(k))) return false;
  return CYBER_KEYWORDS.some((k) => t.includes(k));
}

// ---------------------------------------------------------------------------
// Document classification
// ---------------------------------------------------------------------------

function classifyDocument(doc: FetchedDocument): "framework" | "circular" | "unknown" {
  const titleLower = doc.title.toLowerCase();
  if (
    titleLower.includes("framework") ||
    titleLower.includes("standard") ||
    titleLower.includes("guideline")
  ) {
    return "framework";
  }
  if (
    titleLower.includes("circular") ||
    titleLower.includes("regulation") ||
    titleLower.includes("requirement")
  ) {
    return "circular";
  }
  // Default: treat longer framework documents as frameworks, shorter as circulars
  return doc.text.length > 50_000 ? "framework" : "circular";
}

function inferFrameworkId(doc: FetchedDocument): string {
  const fn = doc.filename.toLowerCase();
  if (fn.includes("cybersecurity") || fn.includes("10435")) return "rbi-csf";
  if (fn.includes("itgr") || fn.includes("12549") || fn.includes("governance")) return "rbi-itgr";
  if (fn.includes("dpsc") || fn.includes("12032") || fn.includes("payment")) return "rbi-dpsc";
  return `rbi-${doc.filename.replace(/\.html$/i, "").replace(/\.pdf$/i, "").toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
}

function inferCircularReference(doc: FetchedDocument): string {
  // Try to extract an RBI circular reference from the text (e.g., RBI/2023-24/xx)
  const refMatch = doc.text.match(/RBI\/\d{4}-\d{2,4}\/\d+/i);
  if (refMatch) return refMatch[0]!.toUpperCase().replace(/\//g, "-");

  // Fall back to a reference derived from the filename and date
  const year = new Date().getFullYear();
  const base = doc.filename.replace(/\.html$/i, "").replace(/\.pdf$/i, "").replace(/[^a-zA-Z0-9]/g, "-").substring(0, 30);
  return `RBI-CIR-${year}-${doc.category.substring(0, 3).toUpperCase()}-${base}`;
}

function extractDate(text: string): string | null {
  // Look for dates in common RBI document formats
  const patterns = [
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i,
    /\b(\d{4})-(\d{2})-(\d{2})\b/,
    /\b(\d{2})\/(\d{2})\/(\d{4})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[2] && /[a-z]/i.test(match[2])) {
        const months: Record<string, string> = {
          january: "01", february: "02", march: "03", april: "04",
          may: "05", june: "06", july: "07", august: "08",
          september: "09", october: "10", november: "11", december: "12",
        };
        const month = months[match[2]!.toLowerCase()] ?? "01";
        return `${match[3]}-${month}-${match[1]!.padStart(2, "0")}`;
      }
      return match[0]!;
    }
  }
  return null;
}

function buildSummary(text: string, maxLen = 500): string {
  // Extract first meaningful paragraph as summary
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 50);
  const firstParagraph = lines[0] ?? "";
  return firstParagraph.length > maxLen
    ? firstParagraph.substring(0, maxLen) + "..."
    : firstParagraph;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!existsSync(RAW_DIR)) {
    console.error(`Raw data directory not found: ${RAW_DIR}`);
    console.error("Run: npm run ingest:fetch");
    process.exit(1);
  }

  // Collect all .meta.json files
  const metaFiles = readdirSync(RAW_DIR)
    .filter((f) => f.endsWith(".meta.json"))
    .sort();

  if (metaFiles.length === 0) {
    console.warn("No .meta.json files found. Run: npm run ingest:fetch");
    return;
  }

  console.log(`Found ${metaFiles.length} fetched documents`);

  if (dryRun) {
    for (const f of metaFiles) {
      const doc: FetchedDocument = JSON.parse(readFileSync(join(RAW_DIR, f), "utf8"));
      const type = classifyDocument(doc);
      console.log(`  [${type}] ${doc.title} (${doc.text.length.toLocaleString()} chars)`);
    }
    return;
  }

  // Set up database
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (force && existsSync(DB_PATH)) {
    unlinkSync(DB_PATH);
    console.log(`Deleted ${DB_PATH}`);
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = DELETE"); // Use DELETE mode for build script (faster for bulk inserts)
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);

  const insertFramework = db.prepare(
    "INSERT OR IGNORE INTO frameworks (id, name, version, domain, description, control_count, effective_date, pdf_url) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertControl = db.prepare(
    "INSERT OR IGNORE INTO controls " +
      "(framework_id, control_ref, domain, subdomain, title, description, maturity_level, priority) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertCircular = db.prepare(
    "INSERT OR IGNORE INTO circulars (reference, title, date, category, summary, full_text, pdf_url, status) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );

  let frameworksInserted = 0;
  let controlsInserted = 0;
  let circularsInserted = 0;

  let dropped = 0;
  for (const metaFile of metaFiles) {
    const doc: FetchedDocument = JSON.parse(readFileSync(join(RAW_DIR, metaFile), "utf8"));
    if (!isCyberRelevant(doc.title)) {
      dropped++;
      console.log(`  SKIP (not cyber-relevant): ${doc.title}`);
      continue;
    }
    const type = classifyDocument(doc);
    console.log(`Processing [${type}]: ${doc.title}`);

    if (type === "framework") {
      const frameworkId = inferFrameworkId(doc);
      const result = insertFramework.run(
        frameworkId,
        doc.title,
        null,
        doc.category,
        buildSummary(doc.text, 1000),
        0,
        extractDate(doc.text),
        doc.url,
      );
      if (result.changes > 0) frameworksInserted++;

      // For a real implementation, parse the HTML/PDF text to extract individual master directions.
      // The structure of RBI notifications varies; a production implementation would use
      // heuristics specific to the RBI direction numbering scheme (e.g., paragraph numbering).
      // Here we insert one placeholder direction per framework document to demonstrate the flow.
      const controlResult = insertControl.run(
        frameworkId,
        `${frameworkId.toUpperCase()}-AUTO-1`,
        doc.category,
        "General",
        `${doc.title} — General Requirements`,
        doc.text.substring(0, 2000) || "See full document for requirements.",
        "Level 1",
        "High",
      );
      if (controlResult.changes > 0) controlsInserted++;
    } else if (type === "circular") {
      const reference = inferCircularReference(doc);
      const result = insertCircular.run(
        reference,
        doc.title,
        extractDate(doc.text),
        doc.category,
        buildSummary(doc.text),
        doc.text || `See full document at: ${doc.url}`,
        doc.url,
        "active",
      );
      if (result.changes > 0) circularsInserted++;
    }
  }

  // Switch to WAL for production use
  db.pragma("journal_mode = WAL");
  db.pragma("vacuum");

  console.log(`
Build complete:
  Frameworks : ${frameworksInserted} inserted
  Controls   : ${controlsInserted} inserted
  Circulars  : ${circularsInserted} inserted
  Dropped    : ${dropped} meta files filtered out (non-cyber titles)

Database: ${DB_PATH}`);
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
