#!/usr/bin/env node

/**
 * India RBI Cybersecurity MCP — stdio entry point.
 *
 * Provides MCP tools for querying Reserve Bank of India (RBI)
 * cybersecurity frameworks, master directions, circulars, and financial
 * sector regulations.
 *
 * Tool prefix: in_rbi_
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  searchRegulations,
  searchControls,
  getControl,
  getCircular,
  listFrameworks,
  getStats,
} from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let pkgVersion = "0.1.0";
try {
  const pkg = JSON.parse(
    readFileSync(join(__dirname, "..", "package.json"), "utf8"),
  ) as { version: string };
  pkgVersion = pkg.version;
} catch {
  // fallback
}

let sourcesYml = "";
try {
  sourcesYml = readFileSync(join(__dirname, "..", "sources.yml"), "utf8");
} catch {
  // fallback
}

const SERVER_NAME = "india-rbi-cybersecurity-mcp";

const DISCLAIMER =
  "This data is provided for informational reference only. It does not constitute legal or professional advice. " +
  "Always verify against official RBI publications at https://rbi.org.in/. " +
  "RBI regulations are subject to change; confirm currency before reliance.";

const SOURCE_URL = "https://rbi.org.in/Scripts/NotificationUser.aspx";

// --- Tool definitions ---------------------------------------------------------

const TOOLS = [
  {
    name: "in_rbi_search_regulations",
    description:
      "Full-text search across RBI cybersecurity master directions and regulatory circulars. " +
      "Covers the RBI Cyber Security Framework for Banks, Master Direction on IT Governance, " +
      "Digital Payment Security Controls, Digital Lending Guidelines, and Outsourcing Directions " +
      "for Indian financial institutions. " +
      "Returns matching directions and circulars with reference, title, domain, and summary.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Search query (e.g., 'access control', 'incident response', 'vendor risk', 'mobile banking security')",
        },
        domain: {
          type: "string",
          description:
            "Filter by domain or category (e.g., 'Cyber Crisis Management', " +
            "'Customer Protection', 'SOC Setup', 'Fraud Management'). Optional.",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return. Defaults to 10, max 50.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "in_rbi_get_regulation",
    description:
      "Get a specific RBI master direction or circular by its reference identifier. " +
      "For master directions use the direction reference (e.g., 'RBI-CSF-2.1', 'RBI-ITGR-3.2'). " +
      "For circulars use the circular reference number (e.g., 'RBI-CIR-2023-IT-001').",
    inputSchema: {
      type: "object" as const,
      properties: {
        document_id: {
          type: "string",
          description: "Master direction reference or circular reference number",
        },
      },
      required: ["document_id"],
    },
  },
  {
    name: "in_rbi_search_master_directions",
    description:
      "Search RBI master directions specifically. Covers all directions across " +
      "the RBI Cyber Security Framework for Banks, Master Direction on IT Governance " +
      "Risk Management Controls & Assurance Practices (2023), and Digital Payment " +
      "Security Controls (2024). " +
      "Returns directions with their domain and implementation guidance.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Search query (e.g., 'vulnerability management', 'patch management', " +
            "'encryption', 'identity and access management')",
        },
        framework: {
          type: "string",
          enum: ["rbi-csf", "rbi-itgr", "rbi-dpsc"],
          description:
            "Filter by framework ID. rbi-csf=Cyber Security Framework for Banks, " +
            "rbi-itgr=IT Governance Risk Management, rbi-dpsc=Digital Payment Security Controls. Optional.",
        },
        domain: {
          type: "string",
          description:
            "Filter by direction domain (e.g., 'Cyber Crisis Management', " +
            "'SOC Setup', 'Customer Protection'). Optional.",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return. Defaults to 10, max 50.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "in_rbi_list_frameworks",
    description:
      "List all RBI frameworks and master directions covered by this server, including version, " +
      "effective date, direction count, and coverage domain. " +
      "Use this to understand what regulatory material is available before searching.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "in_rbi_about",
    description:
      "Return metadata about this MCP server: version, data sources, coverage summary, " +
      "and list of available tools.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "in_rbi_list_sources",
    description:
      "Return data provenance information: which RBI sources are indexed, " +
      "how data is retrieved, update frequency, and licensing terms.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

// --- Zod schemas --------------------------------------------------------------

const SearchRegulationsArgs = z.object({
  query: z.string().min(1),
  domain: z.string().optional(),
  limit: z.number().int().positive().max(50).optional(),
});

const GetRegulationArgs = z.object({
  document_id: z.string().min(1),
});

const SearchMasterDirectionsArgs = z.object({
  query: z.string().min(1),
  framework: z.enum(["rbi-csf", "rbi-itgr", "rbi-dpsc"]).optional(),
  domain: z.string().optional(),
  limit: z.number().int().positive().max(50).optional(),
});

// --- Helpers ------------------------------------------------------------------

function textContent(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorContent(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

function buildMeta(sourceUrl?: string): Record<string, unknown> {
  return {
    disclaimer: DISCLAIMER,
    data_age: "See coverage.json; refresh frequency: monthly",
    source_url: sourceUrl ?? SOURCE_URL,
  };
}

// --- Server -------------------------------------------------------------------

const server = new Server(
  { name: SERVER_NAME, version: pkgVersion },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case "in_rbi_search_regulations": {
        const parsed = SearchRegulationsArgs.parse(args);
        const results = searchRegulations({
          query: parsed.query,
          domain: parsed.domain,
          limit: parsed.limit ?? 10,
        });
        return textContent({
          results,
          count: results.length,
          _meta: buildMeta(),
        });
      }

      case "in_rbi_get_regulation": {
        const parsed = GetRegulationArgs.parse(args);
        const docId = parsed.document_id;

        // Try control / master direction first
        const control = getControl(docId);
        if (control) {
          return textContent({
            ...control,
            _citation: {
              canonical_ref: control.control_ref,
              display_text: `RBI — ${control.title} (${control.control_ref})`,
            },
            _meta: buildMeta(),
          });
        }

        // Try circular
        const circular = getCircular(docId);
        if (circular) {
          return textContent({
            ...circular,
            _citation: {
              canonical_ref: circular.reference,
              display_text: `RBI Circular — ${circular.title} (${circular.reference})`,
            },
            _meta: buildMeta(circular.pdf_url ?? SOURCE_URL),
          });
        }

        return errorContent(
          `No master direction or circular found with reference: ${docId}. ` +
            "Use in_rbi_search_regulations to find available references.",
        );
      }

      case "in_rbi_search_master_directions": {
        const parsed = SearchMasterDirectionsArgs.parse(args);
        const results = searchControls({
          query: parsed.query,
          framework: parsed.framework,
          domain: parsed.domain,
          limit: parsed.limit ?? 10,
        });
        return textContent({
          results,
          count: results.length,
          _meta: buildMeta(),
        });
      }

      case "in_rbi_list_frameworks": {
        const frameworks = listFrameworks();
        return textContent({
          frameworks,
          count: frameworks.length,
          _meta: buildMeta(),
        });
      }

      case "in_rbi_about": {
        const stats = getStats();
        return textContent({
          name: SERVER_NAME,
          version: pkgVersion,
          description:
            "Reserve Bank of India (RBI) Cybersecurity MCP server. " +
            "Provides structured access to RBI cybersecurity frameworks, master directions, " +
            "and regulatory circulars for financial institutions operating in India.",
          data_source: "Reserve Bank of India (RBI)",
          source_url: SOURCE_URL,
          coverage: {
            frameworks: `${stats.frameworks} RBI frameworks / master directions`,
            controls: `${stats.controls} master direction provisions`,
            circulars: `${stats.circulars} regulatory circulars`,
            jurisdictions: ["India"],
            sectors: ["Banking", "NBFCs", "Payment Service Providers", "Digital Lending"],
          },
          tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
          _meta: buildMeta(),
        });
      }

      case "in_rbi_list_sources": {
        return textContent({
          sources_yml: sourcesYml,
          note: "Data is sourced from official RBI public notifications. See sources.yml for full provenance.",
          _meta: buildMeta(),
        });
      }

      default:
        return errorContent(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return errorContent(
      `Error executing ${name}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
});

// --- Start --------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`${SERVER_NAME} v${pkgVersion} running on stdio\n`);
}

main().catch((err) => {
  process.stderr.write(
    `Fatal error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
