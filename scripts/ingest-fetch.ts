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
  unlinkSync,
} from "node:fs";
import { join, basename } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = "https://rbi.org.in";
// NOTE: The RBI portal uses ASP.NET; content is paginated via query params.
// Category listing URL pattern: /Scripts/NotificationUser.aspx?Category=<n>&Year=<yyyy>
// Single notification: /Scripts/NotificationUser.aspx?Id=<id>&Mode=0
const PORTAL_URL = `${BASE_URL}/Scripts/NotificationUser.aspx`;
const RAW_DIR = "data/raw";
const RATE_LIMIT_MS = 5000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_BASE_MS = 2000;
const REQUEST_TIMEOUT_MS = 60_000;
const USER_AGENT = "Ansvar-MCP/1.0 (regulatory-data-ingestion; https://ansvar.eu)";
// Playwright driver uses a real Chrome UA so the ASP.NET portal serves the
// standard accordion markup rather than a reduced variant.
const PLAYWRIGHT_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
// Years to enumerate via Playwright. Cyber-era starts 2011 (G-Sec IT
// Framework) but the earliest cyber-relevant items of substance land 2015+.
// 2026 is current year.
const ENUMERATION_START_YEAR = 2015;
const ENUMERATION_END_YEAR = new Date().getFullYear();

// Keywords to identify cybersecurity and IT-relevant documents.
// Matched against the document title (case-insensitive) post-fetch.
const CYBER_KEYWORDS = [
  "cybersecurity",
  "cyber security",
  "cyber",
  "information security",
  "information technology",
  "it governance",
  "it security",
  "cloud computing",
  "cloud adoption",
  "digital payment",
  "digital lending",
  "digital banking",
  "business continuity",
  "outsourcing",
  "fintech",
  "data protection",
  "incident",
  "vulnerability",
  "mobile banking",
  "internet banking",
  "fraud",
  "cert-in",
  "payment security",
  "card transaction",
  "card-on-file",
  "tokenisation",
  "tokenization",
  "virtual currenc",
  "crypto",
  "atm ",
  "atms",
  "pos ",
  "contactless card",
  "e-mandate",
  "unified payment",
  "upi",
  // RBI 2025 consolidation exercise — these titles cover cyber-adjacent
  // controls (authentication, card security, credit data protection).
  "know your customer",
  "kyc",
  "digital banking channel",
  "credit card",
  "debit card",
  "card transaction",
  "credit information reporting",
  "issuance and conduct",
  "aadhaar",
  "biometric",
  "authentication mechanism",
];

// Words that cause false positives in substring matching — if the title
// matches ONLY on these via another keyword's substring overlap, drop it.
// (e.g. "treATMent" triggers "atm" match; "bUPIng" is rare but guarded.)
const FALSE_POSITIVE_ANTI_KEYWORDS = [
  "wilful defaulters",
  "large defaulters",
  "exposure norms",
  "sovereign gold bond",
  "line of credit",
  "lead bank",
  // "Kisan Credit Card" is an agricultural loan scheme, not payment-card security.
  "kisan credit card",
  "interest subvention",
  // Agricultural / rural loan schemes that mention "credit card" incidentally.
  "agriculture and allied activities",
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

/**
 * Extract the actual document title from an RBI notification page.
 * RBI notifications use `<td class="tableheader"><b>Title</b></td>` structure.
 * Falls back to <title> tag if the canonical pattern is not present.
 */
function extractHtmlTitle(html: string): string | null {
  const $ = cheerio.load(html);
  // Primary pattern — RBI notification title is in tableheader > b
  const tableHeaderTitle = $("td.tableheader b").first().text().trim();
  if (tableHeaderTitle && tableHeaderTitle.length > 5) return tableHeaderTitle;

  // Secondary pattern — <p class="head"> used in some notifications
  const pHead = $('p.head').first().text().trim();
  if (pHead && pHead.length > 5) return pHead;

  // Last resort — page <title>, but strip the generic "Notifications - ..." suffix
  const pageTitle = $("title").first().text().trim();
  if (pageTitle && !pageTitle.toLowerCase().includes("notifications - reserve bank")) {
    return pageTitle;
  }
  return null;
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
  if (FALSE_POSITIVE_ANTI_KEYWORDS.some((kw) => lower.includes(kw))) return false;
  return CYBER_KEYWORDS.some((kw) => lower.includes(kw));
}

async function scrapeMasterDirectionsIndex(): Promise<DocumentLink[]> {
  // BS_ViewMasterDirections.aspx is a static page that lists every active
  // Master Direction grouped by functional head (no JS/postback required).
  // We filter to cyber/IT/outsourcing/fraud/payment-security entries by title.
  const INDEX_URL = `${BASE_URL}/Scripts/BS_ViewMasterDirections.aspx`;
  console.log(`Fetching RBI Master Directions index: ${INDEX_URL}`);
  try {
    const response = await fetchWithRetry(INDEX_URL);
    const html = await response.text();
    const $ = cheerio.load(html);

    const links: DocumentLink[] = [];
    $("a[href*='BS_ViewMasDirections.aspx?id=']").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const title = $(el).text().trim();
      if (!href || !title) return;
      if (!isCyberRelevant(title)) return;

      const fullUrl = href.startsWith("http") ? href : `${BASE_URL}/Scripts/${href.replace(/^.*BS_ViewMasDirections/, "BS_ViewMasDirections")}`;
      const idMatch = /id=(\d+)/i.exec(fullUrl);
      const mdId = idMatch?.[1] ?? "";
      const filename = mdId ? `rbi-masdir-${mdId}.html` : `rbi-md-${links.length + 1}.html`;

      let category = "Regulatory";
      const t = title.toLowerCase();
      if (t.includes("cyber")) category = "Cybersecurity";
      else if (t.includes("outsourc")) category = "Outsourcing";
      else if (t.includes("information technology") || t.includes("it ") || t.includes("it governance")) category = "IT Governance";
      else if (t.includes("digital payment") || t.includes("card")) category = "Digital Payments";
      else if (t.includes("fraud")) category = "Fraud Management";
      else if (t.includes("digital lending")) category = "Digital Lending";

      if (links.some((l) => l.url === fullUrl)) return;
      links.push({ title, url: fullUrl, category, filename });
    });
    console.log(`  Discovered ${links.length} cyber-relevant Master Directions from index`);
    return links;
  } catch (err) {
    console.warn(
      `  Warning: Master Directions index fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

/**
 * Playwright-driven enumeration of the RBI Notifications portal.
 *
 * The portal uses ASP.NET WebForms with a client-side `GetYearMonth(year, month)`
 * helper that sets two hidden fields (`hdnYear`, `hdnMonth`) and clicks the
 * postback submit button. The response is a re-render of the same page with
 * the selected year/month's circular list in the DOM (all `<a href="NotificationUser.aspx?Id=..."`).
 *
 * Strategy per year:
 *   - Call `GetYearMonth(year, "0")` → "All Months" → entire year's circulars.
 *   - Wait for the POST round-trip, then scrape every `Id=\d+` anchor + title.
 *   - Apply cyber keyword filter post-scrape.
 */
async function enumerateNotificationsViaPlaywright(): Promise<DocumentLink[]> {
  console.log(
    `Playwright enumeration: years ${ENUMERATION_START_YEAR}-${ENUMERATION_END_YEAR}`,
  );
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ userAgent: PLAYWRIGHT_UA });
    const page = await ctx.newPage();
    page.setDefaultTimeout(90_000);

    console.log(`  Navigating to ${PORTAL_URL}`);
    await page.goto(PORTAL_URL, { waitUntil: "domcontentloaded" });
    await page
      .waitForLoadState("networkidle", { timeout: 60_000 })
      .catch(() => {});

    const collected = new Map<string, DocumentLink>();
    let totalScanned = 0;

    for (let year = ENUMERATION_END_YEAR; year >= ENUMERATION_START_YEAR; year--) {
      try {
        const yearLinks = await scrapeYearViaPostback(page, String(year));
        const pretotal = (yearLinks as DocumentLink[] & { __total?: number }).__total ?? yearLinks.length;
        totalScanned += pretotal;
        let kept = 0;
        for (const link of yearLinks) {
          if (!collected.has(link.url)) {
            collected.set(link.url, link);
            kept++;
          }
        }
        console.log(
          `  Year ${year}: ${pretotal} total circulars scanned, ${yearLinks.length} matched cyber filter, ${kept} new (running total: ${collected.size})`,
        );
      } catch (err) {
        console.warn(
          `  Year ${year}: enumeration failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // Respect RBI's rate limits — 5s between postbacks.
      await sleep(RATE_LIMIT_MS);
    }

    console.log(
      `  Playwright enumeration complete: scanned ${totalScanned} circulars across ${ENUMERATION_END_YEAR - ENUMERATION_START_YEAR + 1} years, kept ${collected.size} cyber-relevant`,
    );
    return Array.from(collected.values());
  } catch (err) {
    console.warn(
      `  Playwright enumeration error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Fire `GetYearMonth(year, "0")` on the RBI portal, wait for the ASP.NET POST
 * to complete, then scrape filtered `Id=\d+` anchors from the refreshed DOM.
 */
async function scrapeYearViaPostback(
  page: Page,
  year: string,
): Promise<DocumentLink[]> {
  // Retry twice — the ASP.NET postback occasionally returns a stale body if the
  // hidden-field state hasn't flushed; a second GetYearMonth call settles it.
  let rawLinks: { title: string; id: string; year: string }[] = [];
  let totalCirculars = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    // Watch for the form postback response so we don't race the DOM update.
    const postbackWait = page
      .waitForResponse(
        (r) =>
          r.url().includes("NotificationUser.aspx") &&
          r.request().method() === "POST",
        { timeout: 45_000 },
      )
      .catch(() => null);

    await page.evaluate((y) => {
      const w = window as unknown as {
        GetYearMonth?: (y: string, m: string) => void;
      };
      if (typeof w.GetYearMonth !== "function") {
        throw new Error("GetYearMonth helper is missing on the page");
      }
      w.GetYearMonth(y, "0");
    }, year);

    await postbackWait;
    await page
      .waitForLoadState("networkidle", { timeout: 30_000 })
      .catch(() => {});
    await page.waitForTimeout(1000);

    const snap = await page.evaluate((selYear) => {
      const results: { title: string; id: string; year: string }[] = [];
      const seen = new Set<string>();
      document.querySelectorAll("a[href*='Id=']").forEach((a) => {
        const href = a.getAttribute("href") ?? "";
        const m = /Id=(\d+)/i.exec(href);
        if (!m) return;
        const id = m[1]!;
        if (seen.has(id)) return;
        seen.add(id);
        const title = (a.textContent ?? "").trim();
        if (!title) return;
        results.push({ title, id, year: selYear });
      });
      return results;
    }, year);

    rawLinks = snap;
    totalCirculars = snap.length;
    if (totalCirculars > 0) break;
    await page.waitForTimeout(2000);
  }

  const links: DocumentLink[] = [];
  for (const row of rawLinks) {
    if (!isCyberRelevant(row.title)) continue;
    const fullUrl = `${BASE_URL}/Scripts/NotificationUser.aspx?Id=${row.id}&Mode=0`;
    const filename = `rbi-notification-${row.id}.html`;

    const t = row.title.toLowerCase();
    let category = "Regulatory";
    if (t.includes("cyber") || t.includes("security framework")) category = "Cybersecurity";
    else if (t.includes("outsourc")) category = "Outsourcing";
    else if (t.includes("cloud") || t.includes("information technology") || t.includes("it governance")) category = "IT Governance";
    else if (t.includes("digital payment") || t.includes("payment security") || t.includes("tokenis") || t.includes("tokeniz") || t.includes("card") || t.includes("upi") || t.includes("contactless")) category = "Digital Payments";
    else if (t.includes("digital lending") || t.includes("lending")) category = "Digital Lending";
    else if (t.includes("fraud")) category = "Fraud Management";
    else if (t.includes("business continuity") || t.includes("covid")) category = "Business Continuity";
    else if (t.includes("virtual currenc") || t.includes("crypto")) category = "Virtual Currencies";

    links.push({ title: row.title, url: fullUrl, category, filename });
  }
  // Return (links, totalCirculars) so the caller can log pre-filter counts.
  (links as DocumentLink[] & { __total?: number }).__total = totalCirculars;
  return links;
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
    console.warn("  Note: Portal homepage yielded no static links (JS/postback required).");
  }

  return links;
}

function getKnownDocuments(): DocumentLink[] {
  // Verified RBI cyber/IT notifications (titles extracted from live pages 2026-04-14).
  // The portal's year/month index requires ASP.NET postback with session state, so
  // exhaustive scraping is not feasible from a simple HTTP client. This seed list
  // captures the most referenced cyber/IT regulatory documents; post-fetch filtering
  // (CYBER_KEYWORDS) drops any that turn out to be unrelated once the real title
  // is parsed from the fetched page.
  return [
    // Confirmed cyber/security titles via tableheader extraction
    {
      title: "Cyber Security Framework in Banks",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=10435&Mode=0",
      category: "Cybersecurity",
      filename: "rbi-notification-10435.html",
    },
    {
      title: "Master Direction on Digital Payment Security Controls",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12032&Mode=0",
      category: "Digital Payments",
      filename: "rbi-notification-12032.html",
    },
    {
      title: "Enhancing Security of Card Transactions",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=11788&Mode=0",
      category: "Payment Security",
      filename: "rbi-notification-11788.html",
    },
    {
      title: "Tokenisation – Card Transactions: Permitting Card-on-File Tokenisation (CoFT) Services",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12159&Mode=0",
      category: "Payment Security",
      filename: "rbi-notification-12159.html",
    },
    {
      title: "Tokenisation – Card Transactions : Extending the Scope of Permitted Devices",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12152&Mode=0",
      category: "Payment Security",
      filename: "rbi-notification-12152.html",
    },
    {
      title: "COVID-19 — Operational and Business Continuity Measures",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=11820&Mode=0",
      category: "Business Continuity",
      filename: "rbi-notification-11820.html",
    },
    {
      title: "Online Dispute Resolution (ODR) System for Digital Payments",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=11946&Mode=0",
      category: "Digital Payments",
      filename: "rbi-notification-11946.html",
    },
    {
      title: "Offline Retail Payments using Cards / Wallets / Mobile Devices – Pilot",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=11947&Mode=0",
      category: "Digital Payments",
      filename: "rbi-notification-11947.html",
    },
    // Master Directions — extracted via BS_ViewMasDirections.aspx index (2026-04-14)
    {
      title: "Master Directions on Frauds – Classification and Reporting by commercial banks and select FIs",
      url: "https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=10477",
      category: "Fraud Management",
      filename: "rbi-masdir-10477.html",
    },
    {
      title: "Master Direction - Information Technology Framework for the NBFC Sector",
      url: "https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=10999",
      category: "IT Governance",
      filename: "rbi-masdir-10999.html",
    },
    {
      title: "Master Direction on Information Technology Governance, Risk, Controls and Assurance Practices",
      url: "https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12562",
      category: "IT Governance",
      filename: "rbi-masdir-12562.html",
    },
    {
      title: "Master Directions on Fraud Risk Management in Commercial Banks (including Regional Rural Banks) and All India Financial Institutions",
      url: "https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12702",
      category: "Fraud Management",
      filename: "rbi-masdir-12702.html",
    },
    {
      title: "Master Directions on Fraud Risk Management in Urban Cooperative Banks (UCBs) / State Cooperative Banks (StCBs) / Central Cooperative Banks (CCBs)",
      url: "https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12703",
      category: "Fraud Management",
      filename: "rbi-masdir-12703.html",
    },
    {
      title: "Master Directions on Fraud Risk Management in Non-Banking Financial Companies (NBFCs) (including Housing Finance Companies)",
      url: "https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12704",
      category: "Fraud Management",
      filename: "rbi-masdir-12704.html",
    },
    {
      title: "Master Directions on Cyber Resilience and Digital Payment Security Controls for non-bank Payment System Operators",
      url: "https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12715",
      category: "Cybersecurity",
      filename: "rbi-masdir-12715.html",
    },
    {
      title: "Reserve Bank of India (Authentication mechanisms for digital payment transactions) Directions, 2025",
      url: "https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12898",
      category: "Digital Payments",
      filename: "rbi-masdir-12898.html",
    },
    {
      title: "Reserve Bank of India (Credit Information Companies – Managing Risks in Outsourcing) Directions, 2025",
      url: "https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12925",
      category: "Outsourcing",
      filename: "rbi-masdir-12925.html",
    },
    {
      title: "Reserve Bank of India (Non-Banking Financial Companies – Managing Risks in Outsourcing) Directions, 2025",
      url: "https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12941",
      category: "Outsourcing",
      filename: "rbi-masdir-12941.html",
    },
    {
      title: "Reserve Bank of India (All India Financial Institutions – Managing Risks in Outsourcing) Directions, 2025",
      url: "https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12967",
      category: "Outsourcing",
      filename: "rbi-masdir-12967.html",
    },
    {
      title: "Reserve Bank of India (Rural Co-operative Banks – Managing Risks in Outsourcing) Directions, 2025",
      url: "https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12986",
      category: "Outsourcing",
      filename: "rbi-masdir-12986.html",
    },
    // Additional candidates — title will be replaced by real title from fetched page,
    // then cyber-keyword filter decides whether to keep. Unrelated IDs are dropped
    // at build-db stage (they never match the keyword list once real titles load).
    {
      title: "RBI Notification 12549 (candidate — filtered post-fetch)",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12549&Mode=0",
      category: "Regulatory",
      filename: "rbi-notification-12549.html",
    },
    {
      title: "RBI Notification 12382 (candidate — filtered post-fetch)",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12382&Mode=0",
      category: "Digital Lending",
      filename: "rbi-notification-12382.html",
    },
    {
      title: "RBI Notification 12601 (candidate — filtered post-fetch)",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12601&Mode=0",
      category: "Outsourcing",
      filename: "rbi-notification-12601.html",
    },
    {
      title: "RBI Notification 12180 (candidate — filtered post-fetch)",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12180&Mode=0",
      category: "IT Governance",
      filename: "rbi-notification-12180.html",
    },
    {
      title: "RBI Notification 12385 (candidate — filtered post-fetch)",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12385&Mode=0",
      category: "Cybersecurity",
      filename: "rbi-notification-12385.html",
    },
    {
      title: "RBI Notification 12650 (candidate — filtered post-fetch)",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12650&Mode=0",
      category: "Technology Governance",
      filename: "rbi-notification-12650.html",
    },
    {
      title: "RBI Notification 12103 (candidate — filtered post-fetch)",
      url: "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12103&Mode=0",
      category: "Virtual Currencies",
      filename: "rbi-notification-12103.html",
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

  // Four discovery paths:
  //   1. Notifications portal homepage (static — usually yields the current year only)
  //   2. Master Directions static index (reliable, yields several cyber MDs)
  //   3. Curated seed list (getKnownDocuments — verified cyber/IT notifications)
  //   4. Playwright year-by-year accordion enumeration (form postback replay;
  //      --skip-playwright disables it for dry-runs / offline debugging)
  const skipPlaywright = args.includes("--skip-playwright");
  const portalLinks = await scrapePortal();
  const mdIndexLinks = await scrapeMasterDirectionsIndex();
  const seedLinks = getKnownDocuments();
  const playwrightLinks = skipPlaywright
    ? []
    : await enumerateNotificationsViaPlaywright();

  // Merge by URL. Order: Playwright > portal > MD index > seed — Playwright's
  // scraped titles are the ground-truth ASP.NET-rendered strings.
  const seen = new Set<string>();
  let documents: DocumentLink[] = [];
  for (const list of [playwrightLinks, portalLinks, mdIndexLinks, seedLinks]) {
    for (const link of list) {
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      documents.push(link);
    }
  }
  console.log(
    `Found ${documents.length} cybersecurity-relevant documents ` +
      `(Playwright: ${playwrightLinks.length}, portal: ${portalLinks.length}, MD index: ${mdIndexLinks.length}, seed: ${seedLinks.length})`,
  );

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
      let realTitle: string | null = null;
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
        realTitle = extractHtmlTitle(html);
      }

      console.log(`  Extracted text: ${text.length.toLocaleString()} chars`);

      // Replace scaffolded/placeholder title with the real title parsed from the
      // fetched page. Then apply the cyber-keyword filter against the true title —
      // unrelated documents (e.g. auction notices, KYC amendments) are dropped.
      const effectiveTitle = realTitle ?? doc.title;
      if (realTitle && realTitle !== doc.title) {
        console.log(`  Real title: ${realTitle}`);
      }
      if (!isCyberRelevant(effectiveTitle)) {
        console.log(`  SKIP (not cyber-relevant): ${effectiveTitle}`);
        // Remove the raw HTML we wrote — we don't keep out-of-scope content.
        try { unlinkSync(destPath); } catch { /* ignore */ }
        continue;
      }

      const meta: FetchedDocument = {
        title: effectiveTitle,
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
