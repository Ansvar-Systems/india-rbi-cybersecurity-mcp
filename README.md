# India RBI Cybersecurity MCP

MCP server for querying Reserve Bank of India (RBI) cybersecurity frameworks, master directions, and circulars. Part of the [Ansvar](https://ansvar.eu) regulatory intelligence platform.

## What's Included

- **RBI Cyber Security Framework for Banks (2016)** — ~50 baseline controls covering cyber crisis management, SOC setup, network security, customer protection, and incident reporting
- **Master Direction on IT Governance, Risk Management, Controls & Assurance Practices (2023)** — ~76 directions for board-level IT oversight, CISO accountability, IT risk management, cloud/outsourcing risk, and business continuity
- **Master Direction on Digital Payment Security Controls (2021, updated 2024)** — ~44 controls for mobile banking, internet banking, UPI, card security, and fraud management
- **RBI Circulars** — ~200 IT/cybersecurity circulars issued to regulated financial institutions (2016-2024)

For full coverage details, see [COVERAGE.md](COVERAGE.md). For tool specifications, see [TOOLS.md](TOOLS.md).

## Installation

### npm (stdio transport)

```bash
npm install @ansvar/india-rbi-cybersecurity-mcp
```

### Docker (HTTP transport)

```bash
docker pull ghcr.io/ansvar-systems/india-rbi-cybersecurity-mcp:latest
docker run -p 9191:9191 ghcr.io/ansvar-systems/india-rbi-cybersecurity-mcp:latest
```

## Usage

### stdio (Claude Desktop, Cursor, etc.)

Add to your MCP client configuration:

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

### HTTP (Streamable HTTP)

```bash
docker run -p 9191:9191 ghcr.io/ansvar-systems/india-rbi-cybersecurity-mcp:latest
# Server available at http://localhost:9191/mcp
```

## Tools

| Tool | Description |
|------|-------------|
| `in_rbi_search_regulations` | Full-text search across RBI master directions and circulars |
| `in_rbi_get_regulation` | Get a specific master direction or circular by reference ID |
| `in_rbi_search_master_directions` | Search master direction provisions with optional framework/domain filters |
| `in_rbi_list_frameworks` | List all RBI frameworks with version and direction counts |
| `in_rbi_about` | Server metadata, version, and coverage summary |
| `in_rbi_list_sources` | Data provenance: sources, retrieval method, licensing |

See [TOOLS.md](TOOLS.md) for parameters, return formats, and examples.

## Data Sources

All data is sourced from official RBI public notifications:

- [RBI Notifications Portal](https://rbi.org.in/Scripts/NotificationUser.aspx)
- [RBI Master Directions](https://rbi.org.in/Scripts/BS_ViewMasCirculardetails.aspx)

See [sources.yml](sources.yml) for full provenance details.

## Development

```bash
git clone https://github.com/Ansvar-Systems/india-rbi-cybersecurity-mcp.git
cd india-rbi-cybersecurity-mcp
npm install
npm run seed        # Create sample database
npm run build       # Compile TypeScript
npm test            # Run tests
npm run dev         # Start HTTP dev server with hot reload
```

## Disclaimer

This server provides informational reference data only. It does not constitute legal or regulatory advice. Always verify against official RBI publications. See [DISCLAIMER.md](DISCLAIMER.md) for full terms.

## License

[BSL-1.1](LICENSE) — Ansvar Systems AB. Converts to Apache-2.0 on 2030-04-13.
