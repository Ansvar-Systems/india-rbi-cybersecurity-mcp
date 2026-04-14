/**
 * RBI Ingestion Fetcher
 *
 * Fetches the RBI Notifications portal, extracts cybersecurity and IT
 * governance-related document links, and downloads content for database ingestion.
 *
 * The RBI notifications page (https://rbi.org.in/Scripts/NotificationUser.aspx)
 * uses ASP.NET WebForms. Pagination is driven by URL query parameters:
 *   ?Id=<notification_id>&Mode=0     — single notification
 *   Category=<category>&Year=<year> — filtered listing
 * The portal primarily serves HTML pages; some older documents link to PDFs.
 * HTML is the primary content format — pdf-parse is kept in dependencies
 * but most content is extracted directly from HTML.
 *
 * Usage:
 *   npx tsx scripts/ingest-fetch.ts
 *   npx tsx scripts/ingest-fetch.ts --dry-run     # log what would be fetched
 *   npx tsx scripts/ingest-fetch.ts --force        # re-download existing files
 *   npx tsx scripts/ingest-fetch.ts --limit 5      # fetch only first N documents
 */

import * as cheerio from "cheerio";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { join, basename } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = "https://rbi.org.in";
// NOTE: The RBI portal uses ASP.NET; content is paginated via query params.
// Category listing URL pattern: /Scripts/NotificationUser.aspx?Category=<n>&Year=<yyyy>
// Single notification: /Scripts/NotificationUser.aspx?Id=<id>&Mode=0
const PORTAL_URL = `${BASE_URL}/Scripts/NotificationUser.aspx`;
const RAW_DIR = "data/raw";
const RATE_LIMIT_MS = 2000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_BASE_MS = 2000;
const REQUEST_TIMEOUT_MS = 60_000;
const USER_AGENT = "Ansvar-MCP/1.0 (regulatory-data-ingestion; https://ansvar.eu)";

// Keywords to identify cybersecurity and IT-relevant documents
const CYBER_KEYWORDS = [
  "cybersecurity",
  "cyber security",
  "information security",
  "information technology",
  "it governance",
  "it security",
  "cloud computing",
  "digital payment",
  "digital lending",
  "business continuity",
  "outsourcing",
  "cyber",
  "fintech",
  "data protection",
  "incident",
  "vulnerability",
  "mobile banking",
  "internet banking",
  "fraud",
  "cert-in",
  "payment security",
];

// CLI flags
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const limitIdx = args.indexOf("--limit");
const fetchLimit = limitIdx !== -1 ? parseInt(args[limitIdx + 1] ?? "999", 10) : 999;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentLink {
  title: string;
  url: string;
  category: string;
  filename: string;
}

interface FetchedDocument {
  title: string;
  url: string;
  category: string;
  filename: string;
  text: string;
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  retries = MAX_RETRIES,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": USER_AGENT },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${url}`);
        }
        return response;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const backoff = RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt);
      console.error(
        `  Attempt ${attempt + 1}/${retries} failed for ${url}: ${lastError.message}. ` +
          `Retrying in ${backoff}ms...`,
      );
      if (attempt < retries - 1) await sleep(backoff);
    }
  }
  throw lastError ?? new Error(`All retries failed for ${url}`);
}

// ---------------------------------------------------------------------------
// HTML text extraction (primary method for RBI portal content)
// ---------------------------------------------------------------------------

function extractHtmlText(html: string): string {
  const $ = cheerio.load(html);
  // Remove script, style, nav, and header/footer noise
  $("script, style, nav, header, footer, .breadcrumb").remove();
  // Extract main content area — RBI uses .contentInner or .notification-content
  const main = $(".contentInner, .notification-content, #main, .innerContent").first();
  return (main.length ? main.text() : $("body").text())
    .replace(/\s+/g, " ")
    .trim();
}

// NOTE: pdf-parse is available in dependencies for any PDF links encountered,
// but the RBI portal primarily serves HTML — the PDF extractor is a fallback
// for direct PDF links on older notifications.
async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(pdfBuffer);
    return data.text ?? "";
  } catch (err) {
    console.error(
      `  Warning: PDF text extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return "";
  }
}

// ---------------------------------------------------------------------------
// RBI portal scraping
// ---------------------------------------------------------------------------

function isCyberRelevant(title: string): boolean {
  const lower = title.toLowerCase();
  return CYBER_KEYWORDS.some((kw) => lower.includes(kw));
}

async function scrapePortal(): Promise<DocumentLink[]> {
  console.log(`Fetching RBI portal: ${PORTAL_URL}`);
  const response = await fetchWithRetry(PORTAL_URL);
  const html = await response.text();
  const $ = cheerio.load(html);

  const links: DocumentLink[] = [];

  // RBI's ASP.NET portal uses anchor tags linking to notification pages or PDFs
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const title = $(el).text().trim();

    if (!href || !title) return;

    // Accept notification page links and direct PDF links
    const isNotificationLink = href.includes("NotificationUser.aspx") ||
      href.includes("Scripts/BS_") ||
      href.toLowerCase().endsWith(".pdf");
    if (!isNotificationLink) return;
    if (!isCyberRelevant(title)) return;

    const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    // Generate a stable filename from the URL
    const urlObj = new URL(fullUrl);
    const notifId = urlObj.searchParams.get("Id") ?? "";
    const filename = notifId
      ? `rbi-notification-${notifId}.html`
      : basename(href.split("?")[0] ?? href) || `rbi-doc-${links.length + 1}.html`;

    // Infer category from title keywords
    let category = "Regulatory";
    if (title.toLowerCase().includes("payment")) category = "Digital Payments";
    else if (title.toLowerCase().includes("lending") || title.toLowerCase().includes("loan")) category = "Digital Lending";
    else if (title.toLowerCase().includes("outsourc")) category = "Outsourcing";
    else if (title.toLowerCase().includes("cloud")) category = "IT Governance";
    else if (title.toLowerCase().includes("cyber") || title.toLowerCase().includes("security")) category = "Cybersecurity";
    else if (title.toLowerCase().includes("fraud")) category = "Fraud Management";

    if (links.some((l) => l.url === fullUrl)) return;
    links.push({ title, url: fullUrl, category, filename });
  });

  if (links.length === 0) {
    console.warn("  Warning: No links found via scraping. Portal may require JavaScript or session state.");
    console.warn("  Falling back to known document list.");
    return getKnownDocuments();
  }

  return links;
}

function getKnownDocuments(): DocumentLink[] {
  return [
    {
      title: "Master Direction on IT Governance, Risk Management, Controls & Assurance Practices (2023)",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12549&Mode=0",
      category: "IT Governance",
      filename: "rbi-notification-12549.html",
    },
    {
      title: "Master Direction on Digital Payment Security Controls",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12032&Mode=0",
      category: "Digital Payments",
      filename: "rbi-notification-12032.html",
    },
    {
      title: "Cyber Security Framework in Banks",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=10435&Mode=0",
      category: "Cybersecurity",
      filename: "rbi-notification-10435.html",
    },
    {
      title: "Guidelines on Digital Lending",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12382&Mode=0",
      category: "Digital Lending",
      filename: "rbi-notification-12382.html",
    },
    {
      title: "Master Direction on Outsourcing of IT Services",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12601&Mode=0",
      category: "Outsourcing",
      filename: "rbi-notification-12601.html",
    },
    {
      title: "Circular on Cloud Adoption by Regulated Entities",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12180&Mode=0",
      category: "IT Governance",
      filename: "rbi-notification-12180.html",
    },
    {
      title: "Compliance with CERT-In Directions 2022 — Banks",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12385&Mode=0",
      category: "Cybersecurity",
      filename: "rbi-notification-12385.html",
    },
    {
      title: "Framework for Responsible and Ethical Enablement of AI (FREE-AI)",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12650&Mode=0",
      category: "Technology Governance",
      filename: "rbi-notification-12650.html",
    },
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!existsSync(RAW_DIR)) {
    mkdirSync(RAW_DIR, { recursive: true });
    console.log(`Created directory: ${RAW_DIR}`);
  }

  let documents = await scrapePortal();
  console.log(`Found ${documents.length} cybersecurity-relevant documents`);

  if (documents.length > fetchLimit) {
    documents = documents.slice(0, fetchLimit);
    console.log(`Limiting to ${fetchLimit} documents`);
  }

  if (dryRun) {
    console.log("\n[DRY RUN] Would fetch:");
    for (const doc of documents) {
      console.log(`  ${doc.title} → ${doc.filename}`);
    }
    return;
  }

  const fetched: FetchedDocument[] = [];
  let skipped = 0;

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i]!;
    const destPath = join(RAW_DIR, doc.filename);
    const metaPath = join(RAW_DIR, `${doc.filename}.meta.json`);

    if (!force && existsSync(metaPath)) {
      console.log(`[${i + 1}/${documents.length}] Skipping (exists): ${doc.title}`);
      skipped++;
      continue;
    }

    console.log(`[${i + 1}/${documents.length}] Fetching: ${doc.title}`);
    console.log(`  URL: ${doc.url}`);

    try {
      const response = await fetchWithRetry(doc.url);
      const contentType = response.headers.get("content-type") ?? "";
      const isPdf = contentType.includes("pdf") || doc.url.toLowerCase().endsWith(".pdf");

      let text: string;
      if (isPdf) {
        const buffer = Buffer.from(await response.arrayBuffer());
        writeFileSync(destPath, buffer);
        console.log(`  Downloaded PDF: ${buffer.length.toLocaleString()} bytes → ${destPath}`);
        text = await extractPdfText(buffer);
      } else {
        const html = await response.text();
        writeFileSync(destPath, html, "utf8");
        console.log(`  Downloaded HTML: ${html.length.toLocaleString()} chars → ${destPath}`);
        text = extractHtmlText(html);
      }

      console.log(`  Extracted text: ${text.length.toLocaleString()} chars`);

      const meta: FetchedDocument = {
        title: doc.title,
        url: doc.url,
        category: doc.category,
        filename: doc.filename,
        text,
        fetchedAt: new Date().toISOString(),
      };

      writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
      fetched.push(meta);
    } catch (err) {
      console.error(
        `  ERROR fetching ${doc.url}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (i < documents.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  const summary = {
    fetchedAt: new Date().toISOString(),
    total: documents.length,
    fetched: fetched.length,
    skipped,
    errors: documents.length - fetched.length - skipped,
    documents: fetched.map((d) => ({
      title: d.title,
      filename: d.filename,
      category: d.category,
      textLength: d.text.length,
    })),
  };

  writeFileSync(join(RAW_DIR, "fetch-summary.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(`\nFetch complete: ${fetched.length} fetched, ${skipped} skipped, ${summary.errors} errors`);
  console.log(`Summary written to ${join(RAW_DIR, "fetch-summary.json")}`);
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
