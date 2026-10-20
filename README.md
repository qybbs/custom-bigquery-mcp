# custom-bigquery-mcp

A standalone Model Context Protocol (MCP) server for Google Cloud BigQuery with enterprise FinOps guardrails, query cost estimation, and strict table allowlisting.

## Features

- **Strict FinOps Guardrails**: Enforces query dry-runs, comment stripping, SQL AST validation, and blocks mutative keywords (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`).
- **Table Allowlisting**: Restricts queries strictly to tables explicitly listed in `ALLOWLIST_TABLES`.
- **Dual Authentication**: Supports Google Cloud Application Default Credentials (ADC) or Service Account Key file.
- **Cross-Project Access**: Automatically configures `userProject` so queries and metadata extraction across different GCP projects (e.g. shared VPC datasets) are billed to your designated execution project.
- **Cost Protection**: Hard query caps (`MAX_BYTES_BILLED`) and client-side retrieval limits (`ROW_LIMIT`).

## Tools Exposed

1. `list_allowed_tables`: List all BigQuery tables allowed for query execution.
2. `describe_table`: Get detailed schema, field descriptions, clustering, and partitioning info.
3. `estimate_query_cost`: Perform dry-run calculation returning scanned bytes and estimated USD cost.
4. `execute_readonly_query`: Execute read-only SQL queries against allowed tables.
5. `search_allowed_tables`: Search allowed tables and schemas by keyword.

## Environment Configuration

Configure via `.env` or pass via MCP driver `env`:

```env
GCP_PROJECT_ID=your-billing-project-id
# GCP_KEY_FILE_PATH=./google-service-account.json (leave commented to use ADC)
ALLOWLIST_TABLES=project.dataset.table1,dataset.table2
MAX_BYTES_BILLED=10737418240
ROW_LIMIT=1000
```

## Running as MCP Server

```bash
# Build
npm install
npm run build

# Start stdio server
node dist/index.js
```

## License

MIT License
