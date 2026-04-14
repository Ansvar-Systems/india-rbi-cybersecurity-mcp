# India RBI Cybersecurity MCP

> Structured access to Reserve Bank of India (RBI) cybersecurity frameworks, master directions, and circulars — 52 cyber/IT-relevant Master Directions plus 139 cybersecurity-relevant circulars (291 total rows across the `frameworks`, `controls`, and `circulars` tables) from 2015 to 2026, with full-text search and citation-grade metadata.

[![npm](https://img.shields.io/npm/v/@ansvar/india-rbi-cybersecurity-mcp)](https://www.npmjs.com/package/@ansvar/india-rbi-cybersecurity-mcp)
[![License](https://img.shields.io/badge/license-BSL--1.1-blue.svg)](LICENSE)
[![CI](https://github.com/Ansvar-Systems/india-rbi-cybersecurity-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/india-rbi-cybersecurity-mcp/actions/workflows/ci.yml)

Part of the [Ansvar](https://ansvar.eu) regulatory intelligence platform. This
MCP server is the authoritative Ansvar source for Indian banking-sector
cybersecurity regulation, covering the RBI Cyber Security Framework for Banks
(2016), Master Direction on IT Governance (2023), Digital Payment Security
Controls (2021, updated 2024), Cyber Resilience for non-bank PSOs (2024),
Fraud Risk Management (2024), Outsourcing Directions (2025), Digital Banking
Channels Authorisation Directions (2025), KYC Directions (2025), Card
Issuance Directions (2025), Credit Information Reporting (2025), Digital
Lending Guidelines (2022), tokenisation rules, and the IT Framework for the
NBFC sector.

## Quick Start

### Remote (Hetzner)

Use the hosted endpoint — no installation needed:

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "india-rbi-cybersecurity": {
      "url": "https://mcp.ansvar.eu/in/rbi-cybersecurity/mcp"
    }
  }
}
```

**Cursor / VS Code** (`.cursor/mcp.json` or `.vscode/mcp.json`):
```json
{
  "servers": {
    "india-rbi-cybersecurity": {
      "url": "https://mcp.ansvar.eu/in/rbi-cybersecurity/mcp"
    }
  }
}
```

### Local (npm)

Run entirely on your machine via stdio transport:

```bash
npx @ansvar/india-rbi-cybersecurity-mcp
```

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "india-rbi-cybersecurity": {
      "command": "npx",
      "args": ["-y", "@ansvar/india-rbi-cybersecurity-mcp"]
    }
  }
}
```

### Docker

```bash
docker pull ghcr.io/ansvar-systems/india-rbi-cybersecurity-mcp:latest
docker run -p 9191:9191 ghcr.io/ansvar-systems/india-rbi-cybersecurity-mcp:latest
```

The Docker image uses Streamable HTTP transport on port 9191 at `/mcp`, with a
liveness probe at `/health`.

## What's Included

| Source | Version | Count | Completeness |
|--------|---------|-------|--------------|
| RBI Master Directions index (`BS_ViewMasterDirections.aspx`, IT/cyber-filtered) | 2015–2026 | 52 Master Directions | Full (344 total on portal, 52 match cyber filter as of 2026-04-14) |
| RBI Notifications (`NotificationUser.aspx`, year-month Playwright enumeration) | 2015–2026 | 163 circulars | Full within cyber scope |
| **Deduplicated DB rows** | | **76 frameworks + 139 circulars = 291 total** | (each MD appears once; notifications that duplicate an MD are not re-inserted) |

> Database classification note: the `frameworks` table holds documents whose title contains "framework", "standard", or "guideline" (23 of 52 Master Directions + 53 notifications matching those keywords + 1 seeded Cyber Security Framework = 76). The other 29 Master Directions are stored in the `circulars` table. To search Master Directions specifically, use `in_rbi_search_master_directions`, which spans both tables.

Notable domains covered (by framework count):

| Domain | Frameworks |
|--------|-----------|
| Regulatory (cross-cutting) | 36 |
| Outsourcing | 16 |
| Digital Payments | 9 |
| IT Governance | 7 |
| Fraud Management | 4 |
| Cybersecurity (named) | 3 |
| Digital Lending | 1 |

Notable circular categories (by circular count): Regulatory 67, Digital
Payments 31, Fraud Management 13, IT Governance 13, Outsourcing 6,
Cybersecurity 3, Payment Security 3, Virtual Currencies 2, Business Continuity
1.

See [COVERAGE.md](COVERAGE.md) for the full ingestion log and highlighted
documents (RBI Cyber Security Framework in Banks, Master Direction on
Information Technology Governance, Master Direction on Digital Payment
Security Controls, Guidelines on Digital Lending, Tokenisation — Card-on-File,
historic 2015–2018 fraud classification circulars, etc.).

## What's NOT Included

- **RBI enforcement orders and penalties** — not systematically published on
  the notifications portal.
- **Hindi-language publications** — English focus for v1 (v2 target).
- **SEBI / IRDAI / NPCI cybersecurity frameworks** — out of scope; SEBI is
  covered by the `india-sebi-cyber-resilience-mcp`, IRDAI by
  `india-irda-guidelines-mcp`.
- **Circulars before 2015** — lower IT/cyber relevance; portal coverage is
  patchy.
- **Non-cyber RBI circulars** — dropped by the cyber/IT keyword filter (see
  `CYBER_KEYWORDS` in `scripts/ingest-fetch.ts`). This is intentional scope
  narrowing, not a gap.
- **Master direction body provisions** — current build indexes one row per
  master direction with the portal abstract; clause-level ingestion is the
  next sprint.

## Installation

### npm (stdio transport)

```bash
npm install @ansvar/india-rbi-cybersecurity-mcp
```

Then wire it into Claude Desktop / Cursor / VS Code as shown under
[Quick Start → Local (npm)](#local-npm).

### Docker (HTTP transport)

```bash
docker pull ghcr.io/ansvar-systems/india-rbi-cybersecurity-mcp:latest
docker run -p 9191:9191 ghcr.io/ansvar-systems/india-rbi-cybersecurity-mcp:latest
# MCP endpoint: http://localhost:9191/mcp
# Health:       http://localhost:9191/health
```

### Hosted

- Public MCP: `https://mcp.ansvar.eu/in/rbi-cybersecurity`
- Gateway (OAuth, multi-MCP):
  [`https://gateway.ansvar.eu`](https://gateway.ansvar.eu)

## Tools

All tools use the `in_rbi_` prefix. Every response includes a `_meta` object
with `disclaimer`, `data_age`, and `source_url`. Error responses also include
`_error_type` (`NO_MATCH` | `INVALID_INPUT` | `INTERNAL_ERROR`). Retrieval
tools return a `_citation` object pinned to the originating RBI URL.

| Tool | Description |
|------|-------------|
| `in_rbi_search_regulations` | Full-text search across RBI cybersecurity master directions and circulars (optional `domain` filter, `limit` ≤50) |
| `in_rbi_get_regulation` | Look up a master direction or circular by reference ID (e.g. `RBI-CSF-2.1`, `RBI-CIR-2023-IT-001`) |
| `in_rbi_search_master_directions` | Search master directions with optional `framework` filter (`rbi-csf`, `rbi-itgr`, `rbi-dpsc`) + domain |
| `in_rbi_list_frameworks` | List every framework with version, effective date, direction count, and coverage domain |
| `in_rbi_about` | Server metadata, coverage summary, available tools |
| `in_rbi_list_sources` | Data provenance: sources, retrieval method, update frequency, licensing |
| `in_rbi_check_data_freshness` | Per-source freshness (`current` / `due_soon` / `overdue`), read at runtime from `data/coverage.json` |

See [TOOLS.md](TOOLS.md) for parameter tables, return formats, and examples.

## Example Queries

```
# Search for cyber crisis and SOC controls across all RBI directions
in_rbi_search_regulations("cyber crisis management SOC", limit=10)

# Find outsourcing risk controls specifically in Master Directions
in_rbi_search_master_directions("third party outsourcing risk", framework="rbi-itgr")

# Look up the 2016 Cyber Security Framework for Banks
in_rbi_get_regulation("RBI/2015-16/418")

# List every framework the MCP tracks, with versions and direction counts
in_rbi_list_frameworks()

# Before relying on results for compliance, check freshness
in_rbi_check_data_freshness()
```

## Development

```bash
git clone https://github.com/Ansvar-Systems/india-rbi-cybersecurity-mcp.git
cd india-rbi-cybersecurity-mcp
npm install
npm run build        # compile TypeScript
npm test             # run Vitest
npm run dev          # HTTP dev server with hot reload (port 9191)
npm run seed         # create sample database for offline development
npm run build:db     # rebuild SQLite from parsed JSON
npm run ingest:full  # Playwright enumeration + build:db + coverage update
```

Full ingestion (`ingest:full`) drives a headless Chromium via Playwright to
replay the `GetYearMonth()` postback on the RBI ASP.NET portal for every year
from 2015 to the current year, pulls every `Id=<n>` anchor from the rendered
DOM, applies the cyber / IT keyword filter, and hands the PDF/HTML download
off to plain `fetch`. Rate-limited at 5 s between postbacks with 3x
exponential backoff; ~3,100 circulars scanned per run, ~170 survive the
filter.

Branching: `feature/* → dev → main`. Direct pushes to `main` are blocked by
branch protection. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full
contribution guide.

## Authority

**Reserve Bank of India (RBI)**
Central Office, Shahid Bhagat Singh Marg, Mumbai 400001, India
https://rbi.org.in

RBI-issued master directions and notifications are binding on the regulated
entities to which they are addressed (scheduled commercial banks, small
finance banks, payments banks, NBFCs, non-bank payment system operators,
cooperative banks, AIFIs, etc.). This MCP reflects the public English
notifications; the PDF/HTML on `rbi.org.in` is the authoritative source.

## License

BSL-1.1. See [LICENSE](LICENSE). Converts to Apache-2.0 on 2030-04-13.

## Disclaimer

This server provides informational reference data only. It does not constitute
legal, regulatory, or professional advice. RBI publications frequently refer
to other statutes (Banking Regulation Act 1949, Payment and Settlement
Systems Act 2007, RBI Act 1934, IT Act 2000, PMLA 2002) that are outside this
MCP's scope. Always verify against the authoritative source at
https://rbi.org.in and engage qualified counsel for compliance decisions.

See [DISCLAIMER.md](DISCLAIMER.md) for full terms.
