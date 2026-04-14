#!/usr/bin/env node

/**
 * HTTP Server Entry Point for Docker Deployment
 *
 * Provides Streamable HTTP transport for remote MCP clients.
 * Use src/index.ts for local stdio-based usage.
 *
 * Endpoints:
 *   GET  /health  — liveness probe
 *   POST /mcp     — MCP Streamable HTTP (session-aware)
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
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

const PORT = parseInt(process.env["PORT"] ?? "9191", 10);
const SERVER_NAME = "india-rbi-cybersecurity-mcp";

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

interface CoverageFile {
  generatedAt?: string;
  mcp?: string;
  version?: string;
  sources?: Array<{
    name: string;
    url?: string;
    last_fetched?: string | null;
    update_frequency?: string;
    item_count?: number;
    status?: string;
  }>;
  totals?: Record<string, number>;
}

let coverageJson: CoverageFile | null = null;
try {
  coverageJson = JSON.parse(
    readFileSync(join(__dirname, "..", "data", "coverage.json"), "utf8"),
  ) as CoverageFile;
} catch {
  coverageJson = null;
}

function currentDataAge(): string {
  if (coverageJson?.generatedAt) {
    return coverageJson.generatedAt.slice(0, 10);
  }
  return "unknown";
}

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
  {
    name: "in_rbi_check_data_freshness",
    description:
      "Report the age of each RBI data source against its expected refresh frequency. " +
      "Returns per-source status (current / due-soon / overdue), last-refresh date, " +
      "expected refresh cadence, and database build date. Use this before relying on " +
      "results for compliance decisions.",
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

function buildMeta(sourceUrl?: string): Record<string, unknown> {
  return {
    disclaimer: DISCLAIMER,
    data_age: currentDataAge(),
    source_url: sourceUrl ?? SOURCE_URL,
  };
}

interface FreshnessSourceReport {
  name: string;
  url: string;
  last_fetched: string | null;
  update_frequency: string;
  max_age_days: number;
  age_days: number | null;
  status: "current" | "due_soon" | "overdue" | "unknown";
  note: string;
}

const FREQUENCY_DAYS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  monthly: 31,
  quarterly: 92,
  annually: 365,
};

function buildFreshnessReport(): {
  database_built: string;
  sources: FreshnessSourceReport[];
  any_stale: boolean;
  update_instructions: string;
} {
  const sources = coverageJson?.sources ?? [];
  const now = Date.now();
  const reports: FreshnessSourceReport[] = [];
  let anyStale = false;

  for (const src of sources) {
    const freq = (src.update_frequency ?? "monthly").toLowerCase();
    const maxAgeDays = FREQUENCY_DAYS[freq] ?? 31;
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

    let ageDays: number | null = null;
    let status: FreshnessSourceReport["status"] = "unknown";
    let note = "no last_fetched recorded";

    if (src.last_fetched) {
      const lastMs = new Date(src.last_fetched).getTime();
      if (!Number.isNaN(lastMs)) {
        ageDays = Math.floor((now - lastMs) / (24 * 60 * 60 * 1000));
        if (now - lastMs > maxAgeMs) {
          status = "overdue";
          note = `last fetched ${ageDays}d ago (max ${maxAgeDays}d for ${freq})`;
          anyStale = true;
        } else if (now - lastMs > maxAgeMs * 0.8) {
          status = "due_soon";
          note = `last fetched ${ageDays}d ago; refresh due within ${maxAgeDays - ageDays}d`;
        } else {
          status = "current";
          note = `last fetched ${ageDays}d ago (within ${freq} window)`;
        }
      }
    }

    reports.push({
      name: src.name,
      url: src.url ?? SOURCE_URL,
      last_fetched: src.last_fetched ?? null,
      update_frequency: freq,
      max_age_days: maxAgeDays,
      age_days: ageDays,
      status,
      note,
    });
  }

  return {
    database_built: currentDataAge(),
    sources: reports,
    any_stale: anyStale,
    update_instructions:
      "To refresh data, run `npm run ingest:full` locally or trigger the `ingest.yml` workflow on GitHub.",
  };
}

// --- MCP server factory -------------------------------------------------------

function createMcpServer(): Server {
  const mcpServer = new Server(
    { name: SERVER_NAME, version: pkgVersion },
    { capabilities: { tools: {} } },
  );

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    function textContent(data: unknown) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }

    type ErrorType = "NO_MATCH" | "INVALID_INPUT" | "INTERNAL_ERROR";

    function errorContent(message: string, errorType: ErrorType = "INTERNAL_ERROR") {
      return {
        content: [{ type: "text" as const, text: message }],
        isError: true as const,
        _error_type: errorType,
        _meta: buildMeta(),
      };
    }

    try {
      switch (name) {
        case "in_rbi_search_regulations": {
          const parsed = SearchRegulationsArgs.parse(args);
          const results = searchRegulations({
            query: parsed.query,
            domain: parsed.domain,
            limit: parsed.limit ?? 10,
          });
          return textContent({ results, count: results.length, _meta: buildMeta() });
        }

        case "in_rbi_get_regulation": {
          const parsed = GetRegulationArgs.parse(args);
          const docId = parsed.document_id;

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
            "NO_MATCH",
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
          return textContent({ results, count: results.length, _meta: buildMeta() });
        }

        case "in_rbi_list_frameworks": {
          const frameworks = listFrameworks();
          return textContent({ frameworks, count: frameworks.length, _meta: buildMeta() });
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
            freshness: {
              database_built: currentDataAge(),
              source_count: coverageJson?.sources?.length ?? 0,
            },
            network: {
              name: "Ansvar MCP Network",
              directory: "https://ansvar.ai/mcp",
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

        case "in_rbi_check_data_freshness": {
          const report = buildFreshnessReport();
          return textContent({ ...report, _meta: buildMeta() });
        }

        default:
          return errorContent(`Unknown tool: ${name}`, "INVALID_INPUT");
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        return errorContent(
          `Invalid arguments for ${name}: ${err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
          "INVALID_INPUT",
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      return errorContent(`Error executing ${name}: ${message}`, "INTERNAL_ERROR");
    }
  });

  return mcpServer;
}

// --- HTTP server --------------------------------------------------------------

async function main(): Promise<void> {
  const sessions = new Map<
    string,
    { transport: StreamableHTTPServerTransport; server: Server }
  >();

  const httpServer = createServer((req, res) => {
    handleRequest(req, res, sessions).catch((err) => {
      console.error(`[${SERVER_NAME}] Unhandled error:`, err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    });
  });

  async function handleRequest(
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
    activeSessions: Map<
      string,
      { transport: StreamableHTTPServerTransport; server: Server }
    >,
  ): Promise<void> {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ status: "ok", server: SERVER_NAME, version: pkgVersion }),
      );
      return;
    }

    if (url.pathname === "/mcp") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (sessionId && activeSessions.has(sessionId)) {
        const session = activeSessions.get(sessionId)!;
        await session.transport.handleRequest(req, res);
        return;
      }

      const mcpServer = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK type mismatch with exactOptionalPropertyTypes
      await mcpServer.connect(transport as any);

      transport.onclose = () => {
        if (transport.sessionId) {
          activeSessions.delete(transport.sessionId);
        }
        mcpServer.close().catch(() => {});
      };

      await transport.handleRequest(req, res);

      if (transport.sessionId) {
        activeSessions.set(transport.sessionId, { transport, server: mcpServer });
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  httpServer.listen(PORT, () => {
    console.error(`${SERVER_NAME} v${pkgVersion} (HTTP) listening on port ${PORT}`);
    console.error(`MCP endpoint:  http://localhost:${PORT}/mcp`);
    console.error(`Health check:  http://localhost:${PORT}/health`);
  });

  process.on("SIGTERM", () => {
    console.error("Received SIGTERM, shutting down...");
    httpServer.close(() => process.exit(0));
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
