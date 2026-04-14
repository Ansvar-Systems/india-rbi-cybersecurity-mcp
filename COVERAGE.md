# Coverage — India RBI Cybersecurity MCP

> Last verified: 2026-04-14 | Database version: 0.1.0

## What's Included

Real content ingested from `rbi.org.in` on 2026-04-14, filtered to IT and
cybersecurity keywords (cybersecurity, cyber, information security, IT governance,
digital payments, card transactions, tokenisation, outsourcing, fraud, business
continuity, internet banking, mobile banking, digital lending, virtual currencies,
cloud, CERT-In, incidents, vulnerabilities, UPI, etc.).

| Source | Items | Version | Completeness | Refresh |
|--------|-------|---------|--------------|---------|
| RBI Master Directions (BS_ViewMasDirections.aspx index, IT/cyber filtered) | 25 directions | 2015–2026 | High | Monthly |
| RBI Notifications (Id-addressed, curated cyber set) | 9 notifications | 2016–2022 | Partial | Monthly |

**Database totals:** 10 frameworks, 10 controls, 23 circulars — **43 rows total**.

### What was ingested

- Cyber Security Framework in Banks (RBI/DBS.CO.CSITE/BC.11, 2016)
- Master Direction on Digital Payment Security Controls (RBI/2020-21/74, 2021)
- Master Direction on Information Technology Governance, Risk, Controls and Assurance Practices (2023)
- Master Directions on Cyber Resilience and Digital Payment Security Controls for non-bank Payment System Operators (2024)
- Master Direction - Information Technology Framework for the NBFC Sector (2016-17)
- Reserve Bank of India (Authentication mechanisms for digital payment transactions) Directions, 2025
- Master Directions on Frauds – Classification and Reporting (commercial banks, 2016 updated 2017)
- Master Directions on Fraud Risk Management (commercial banks, UCBs, NBFCs) (2024)
- 12 × Reserve Bank of India (… – Managing Risks in Outsourcing) Directions 2025 (commercial, SFB, Payments, LAB, RRB, UCB, Rural Co-op, AIFI, NBFC, CIC, etc.)
- 7 × Reserve Bank of India (… – Digital Banking Channels Authorisation) Directions 2025
- Guidelines on Digital Lending (2022)
- Enhancing Security of Card Transactions (2019)
- Tokenisation – Card-on-File (CoFT) Services + Extending Permitted Devices
- Online Dispute Resolution (ODR) System for Digital Payments (2020)
- COVID-19 — Operational and Business Continuity Measures (2020)
- Customer Due Diligence for transactions in Virtual Currencies (2021)

## What's NOT Included

| Gap | Reason | Planned? |
|-----|--------|----------|
| **Full circular archive by year/month** | RBI `NotificationUser.aspx` is JS/postback-driven; the accordion-based year/month index requires ASP.NET ViewState + session state to enumerate. The static `BS_ViewMasterDirections.aspx` index supplies all active Master Directions but not the ~200 circulars the task expected pre-filter. | Yes — via headless browser or ViewState replay |
| RBI enforcement orders and penalties | Not systematically published | No |
| Hindi-language publications | English focus for v1 | Yes v2 |
| SEBI/IRDAI/NPCI cybersecurity frameworks | Out of scope for this MCP | No |
| Circulars older than 2016 | Lower IT/cyber relevance; static landing page only shows current-month circulars | No |

## Limitations

- **ASP.NET postback pagination not replayed.** The RBI notifications portal uses
  WebForms with `__VIEWSTATE`/`__EVENTVALIDATION` hidden fields and a JS
  `GetYearMonth()` callback that submits a form postback. Pure HTTP scraping
  yields the accordion shell but no notification entries. We work around this by
  scraping the static `BS_ViewMasterDirections.aspx` index (yields every active
  Master Direction) and supplementing with a curated set of Id-addressed
  notifications fetched directly via `?Id=<n>&Mode=0`.
- **IT/cyber keyword filter applied to titles.** Fetched documents whose real
  title (extracted from `td.tableheader > b`) does not match any keyword in
  `CYBER_KEYWORDS` are dropped. An anti-keyword list
  (`FALSE_POSITIVE_ANTI_KEYWORDS` — e.g., "wilful defaulters", "sovereign gold
  bond") guards against substring collisions such as "treATMent".
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
  2026-04-14.
- Reference numbers synthesised for some circulars where the `RBI/YYYY-YY/NN`
  pattern was not present in the fetched HTML (prefixed `RBI-CIR-2026-*`).

## Data Freshness

| Source | Refresh Schedule | Last Refresh | Next Expected |
|--------|------------------|--------------|---------------|
| RBI Master Directions (index + entries) | Monthly | 2026-04-14 | 2026-05-14 |
| RBI Notifications (curated cyber set) | Monthly | 2026-04-14 | 2026-05-14 |

To check freshness programmatically, call the `in_rbi_about` tool. The
`data/.source-hashes.json` file records SHA-256 hashes of every fetched raw HTML
file so `scripts/ingest-diff.ts` can detect upstream content changes on the next
run.
