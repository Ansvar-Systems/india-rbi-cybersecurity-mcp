# Coverage — India RBI Cybersecurity MCP

> Last verified: 2026-04-14 | Database version: 0.1.0

## What's Included

Real content ingested from `rbi.org.in` on 2026-04-14, filtered to IT and
cybersecurity keywords (cybersecurity, cyber, information security, IT governance,
digital payments, card transactions, tokenisation, outsourcing, fraud, business
continuity, internet banking, mobile banking, digital lending, virtual currencies,
cloud, CERT-In, incidents, vulnerabilities, UPI, KYC, digital banking channels,
credit/debit card issuance and conduct, credit information reporting, authentication
mechanisms, Aadhaar, biometric, etc.).

| Source | Items | Version | Completeness | Refresh |
|--------|-------|---------|--------------|---------|
| RBI Notifications (year/month accordion, Playwright-driven) | 169 notifications | 2015–2026 | Full cyber-filtered archive | Monthly |
| RBI Master Directions (BS_ViewMasDirections.aspx index, IT/cyber filtered) | 52 directions | 2015–2026 | High | Monthly |
| RBI Notifications (curated Id-addressed seed) | 4 notifications | 2016–2022 | Supplementary | Monthly |

**Database totals:** 76 frameworks, 76 controls, 139 circulars — **291 rows total**.

### How ingestion works

The RBI notifications portal uses ASP.NET WebForms with a JS `GetYearMonth(year, month)`
helper that sets two hidden fields (`hdnYear`, `hdnMonth`) and triggers a `__VIEWSTATE`
postback on the same URL. Pure HTTP scraping returns the accordion shell but no
entries. `scripts/ingest-fetch.ts` drives a headless Chromium via Playwright to
replay the postback for every year from 2015 to the current year, scrapes the
resulting `a[href*='Id=']` anchors, and applies the cyber keyword filter. Master
Directions are additionally harvested from the static `BS_ViewMasterDirections.aspx`
index (no postback needed).

### What was ingested (highlights)

- Cyber Security Framework in Banks (RBI/2015-16/418 DBS.CO/CSITE/BC.11, 2016)
- Master Direction on Digital Payment Security Controls (RBI/2020-21/74, 2021)
- Master Direction on Information Technology Governance, Risk, Controls and Assurance Practices (2023)
- Master Directions on Cyber Resilience and Digital Payment Security Controls for non-bank Payment System Operators (2024)
- Master Direction - Information Technology Framework for the NBFC Sector (2016-17)
- Reserve Bank of India (Authentication mechanisms for digital payment transactions) Directions, 2025
- Master Directions on Fraud Risk Management (commercial banks, UCBs, NBFCs) (2024)
- 12+ Reserve Bank of India (... – Managing Risks in Outsourcing) Directions 2025 (commercial, SFB, Payments, LAB, RRB, UCB, Rural Co-op, AIFI, NBFC, CIC, etc.)
- 10+ Reserve Bank of India (... – Digital Banking Channels Authorisation) Directions 2025
- 10+ Reserve Bank of India (... – Know Your Customer) Directions 2025 (KYC across every bank type)
- Reserve Bank of India (... – Credit Cards and Debit Cards: Issuance and Conduct) Directions 2025
- Reserve Bank of India (... – Credit Information Reporting) Directions 2025
- Guidelines on Digital Lending (2022)
- Enhancing Security of Card Transactions (RBI/2019-20/142, 2020)
- Tokenisation – Card-on-File (CoFT) Services + Extending Permitted Devices
- Cyber Security Controls for Third Party ATM Switch Application Service Providers (2019)
- Comprehensive Cyber Security Framework for Primary (Urban) Cooperative Banks (2019)
- ATMs – Security and Risk Mitigation Measures for Card Present (CP) Transactions (2017)
- Online Dispute Resolution (ODR) System for Digital Payments (2020)
- COVID-19 — Operational and Business Continuity Measures (2020)
- Customer Due Diligence for transactions in Virtual Currencies (2021)
- Historic 2015–2018 fraud classification and reporting circulars

## What's NOT Included

| Gap | Reason | Planned? |
|-----|--------|----------|
| RBI enforcement orders and penalties | Not systematically published on the notifications portal | No |
| Hindi-language publications | English focus for v1 | Yes v2 |
| SEBI/IRDAI/NPCI cybersecurity frameworks | Out of scope for this MCP | No |
| Circulars before 2015 | Lower IT/cyber relevance; portal coverage is patchy; we enumerate 2015–present | No |

## Limitations

- **Playwright enumeration.** `scripts/ingest-fetch.ts` now drives a headless
  Chromium to replay the `GetYearMonth()` postback on the RBI ASP.NET portal,
  pulls every `Id=<n>` anchor from the re-rendered DOM, then hands the PDF/HTML
  download over to plain fetch. Real Chrome UA, 5s between postbacks, retry on
  empty response. ~3,100 circulars are scanned across 2015–2026; ~170 survive
  the cyber keyword filter.
- **IT/cyber keyword filter applied to titles.** Fetched documents whose real
  title (extracted from `td.tableheader > b`) does not match any keyword in
  `CYBER_KEYWORDS` are dropped. An anti-keyword list
  (`FALSE_POSITIVE_ANTI_KEYWORDS` — e.g., "wilful defaulters", "sovereign gold
  bond", "kisan credit card", "interest subvention") guards against substring
  collisions such as "treATMent" or agricultural-loan schemes that use
  "credit card" language.
- **Content extraction uses body fallback.** RBI pages do not use the
  `.contentInner` / `.notification-content` selectors our extractor prefers, so
  full `<body>` text is used. Some navigation and footer text leaks into
  `summary` and `full_text` columns.
- **Robots.txt.** `rbi.org.in/robots.txt` returns an "Unauthorised Access" HTML
  page for every User-Agent tested (curl, generic browser string, Ansvar UA).
  The portal itself returns HTTP 200 for the same UA. No explicit `Disallow` is
  served. We proceed on the basis that no machine-readable prohibition exists.
- **Rate limiting.** 5-second minimum delay between requests, 3x exponential
  backoff on failure, 60s timeout. No 403/429 observed during ingestion run
  2026-04-14 (~225 fetches over ~25 minutes).
- Reference numbers synthesised for some circulars where the `RBI/YYYY-YY/NN`
  pattern was not present in the fetched HTML (prefixed `RBI-CIR-2026-*`).

## Data Freshness

| Source | Refresh Schedule | Last Refresh | Next Expected |
|--------|------------------|--------------|---------------|
| RBI Notifications (Playwright enumeration) | Monthly | 2026-04-14 | 2026-05-14 |
| RBI Master Directions (index + entries) | Monthly | 2026-04-14 | 2026-05-14 |

To check freshness programmatically, call the `in_rbi_about` tool. The
`data/.source-hashes.json` file records SHA-256 hashes of every fetched raw HTML
file so `scripts/ingest-diff.ts` can detect upstream content changes on the next
run.
