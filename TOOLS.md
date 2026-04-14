# Tools — India RBI Cybersecurity MCP

All tools use the `in_rbi_` prefix. Every response includes a `_meta` object with `disclaimer`, `data_age`, and `source_url`.

---

## in_rbi_search_regulations

Full-text search across RBI cybersecurity master directions and regulatory circulars.

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | Search query (e.g., "access control", "incident response") |
| `domain` | string | No | Filter by domain or category |
| `limit` | number | No | Max results (default 10, max 50) |

### Example Call

```json
{
  "name": "in_rbi_search_regulations",
  "arguments": {
    "query": "access control",
    "limit": 5
  }
}
```

### Example Response

```json
{
  "results": [
    {
      "type": "control",
      "control_ref": "RBI-ITGR-4.1",
      "title": "Identity and Access Management",
      "domain": "Information Security",
      "framework": "rbi-itgr",
      "summary": "All users accessing RE systems must have unique identifiers..."
    }
  ],
  "count": 1,
  "_meta": {
    "disclaimer": "This data is provided for informational reference only...",
    "data_age": "See coverage.json; refresh frequency: monthly",
    "source_url": "https://rbi.org.in/Scripts/NotificationUser.aspx"
  }
}
```

---

## in_rbi_get_regulation

Get a specific RBI master direction or circular by its reference identifier.

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `document_id` | string | Yes | Master direction reference (e.g., "RBI-ITGR-4.1") or circular reference (e.g., "RBI-CIR-2023-IT-001") |

### Example Call

```json
{
  "name": "in_rbi_get_regulation",
  "arguments": {
    "document_id": "RBI-CSF-2.1"
  }
}
```

### Example Response

```json
{
  "control_ref": "RBI-CSF-2.1",
  "title": "Security Operations Centre",
  "domain": "SOC Setup",
  "framework": "rbi-csf",
  "description": "Banks above prescribed thresholds must establish a Security Operations Centre (SOC)...",
  "_citation": {
    "canonical_ref": "RBI-CSF-2.1",
    "display_text": "RBI — Security Operations Centre (RBI-CSF-2.1)"
  },
  "_meta": {
    "disclaimer": "This data is provided for informational reference only...",
    "data_age": "See coverage.json; refresh frequency: monthly",
    "source_url": "https://rbi.org.in/Scripts/NotificationUser.aspx"
  }
}
```

Returns an error if the reference is not found, with a suggestion to use `in_rbi_search_regulations`.

---

## in_rbi_search_master_directions

Search RBI master direction provisions with optional framework and domain filters.

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | Search query (e.g., "vulnerability management", "encryption") |
| `framework` | string | No | Filter by framework: `rbi-csf`, `rbi-itgr`, or `rbi-dpsc` |
| `domain` | string | No | Filter by direction domain |
| `limit` | number | No | Max results (default 10, max 50) |

### Example Call

```json
{
  "name": "in_rbi_search_master_directions",
  "arguments": {
    "query": "incident reporting",
    "framework": "rbi-csf",
    "limit": 5
  }
}
```

### Example Response

```json
{
  "results": [
    {
      "control_ref": "RBI-CSF-1.2",
      "title": "Cyber Incident Reporting to RBI",
      "domain": "Cyber Crisis Management",
      "framework": "rbi-csf",
      "description": "Banks must report all unusual cyber incidents... within 2-6 hours of detection.",
      "maturity_level": "Baseline"
    }
  ],
  "count": 1,
  "_meta": {
    "disclaimer": "This data is provided for informational reference only...",
    "data_age": "See coverage.json; refresh frequency: monthly",
    "source_url": "https://rbi.org.in/Scripts/NotificationUser.aspx"
  }
}
```

---

## in_rbi_list_frameworks

List all RBI frameworks and master directions covered by this server.

### Parameters

None.

### Example Call

```json
{
  "name": "in_rbi_list_frameworks",
  "arguments": {}
}
```

### Example Response

```json
{
  "frameworks": [
    {
      "id": "rbi-csf",
      "name": "RBI Cyber Security Framework for Banks",
      "version": "2016 (updated 2021)",
      "effective_date": "2016-06-02",
      "control_count": 52,
      "domain": "Cybersecurity"
    },
    {
      "id": "rbi-itgr",
      "name": "Master Direction on IT Governance, Risk Management, Controls & Assurance Practices",
      "version": "2023",
      "effective_date": "2023-04-01",
      "control_count": 76,
      "domain": "IT Governance"
    },
    {
      "id": "rbi-dpsc",
      "name": "Master Direction on Digital Payment Security Controls",
      "version": "2021 (updated 2024)",
      "effective_date": "2021-02-18",
      "control_count": 44,
      "domain": "Digital Payments"
    }
  ],
  "count": 3,
  "_meta": {
    "disclaimer": "This data is provided for informational reference only...",
    "data_age": "See coverage.json; refresh frequency: monthly",
    "source_url": "https://rbi.org.in/Scripts/NotificationUser.aspx"
  }
}
```

---

## in_rbi_about

Return metadata about this MCP server: version, data sources, coverage summary, and available tools.

### Parameters

None.

### Example Call

```json
{
  "name": "in_rbi_about",
  "arguments": {}
}
```

### Example Response

```json
{
  "name": "india-rbi-cybersecurity-mcp",
  "version": "0.1.0",
  "description": "Reserve Bank of India (RBI) Cybersecurity MCP server...",
  "data_source": "Reserve Bank of India (RBI)",
  "source_url": "https://rbi.org.in/Scripts/NotificationUser.aspx",
  "coverage": {
    "frameworks": "3 RBI frameworks / master directions",
    "controls": "172 master direction provisions",
    "circulars": "8 regulatory circulars",
    "jurisdictions": ["India"],
    "sectors": ["Banking", "NBFCs", "Payment Service Providers", "Digital Lending"]
  },
  "tools": [
    { "name": "in_rbi_search_regulations", "description": "..." },
    { "name": "in_rbi_get_regulation", "description": "..." },
    { "name": "in_rbi_search_master_directions", "description": "..." },
    { "name": "in_rbi_list_frameworks", "description": "..." },
    { "name": "in_rbi_about", "description": "..." },
    { "name": "in_rbi_list_sources", "description": "..." }
  ],
  "_meta": {
    "disclaimer": "This data is provided for informational reference only...",
    "data_age": "See coverage.json; refresh frequency: monthly",
    "source_url": "https://rbi.org.in/Scripts/NotificationUser.aspx"
  }
}
```

---

## in_rbi_list_sources

Return data provenance information: which RBI sources are indexed, retrieval method, update frequency, and licensing terms.

### Parameters

None.

### Example Call

```json
{
  "name": "in_rbi_list_sources",
  "arguments": {}
}
```

### Example Response

```json
{
  "sources_yml": "schema_version: \"1.0\"\nmcp_name: \"India RBI Cybersecurity MCP\"\n...",
  "note": "Data is sourced from official RBI public notifications. See sources.yml for full provenance.",
  "_meta": {
    "disclaimer": "This data is provided for informational reference only...",
    "data_age": "See coverage.json; refresh frequency: monthly",
    "source_url": "https://rbi.org.in/Scripts/NotificationUser.aspx"
  }
}
```
