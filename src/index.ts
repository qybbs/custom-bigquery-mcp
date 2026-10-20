#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import {
  listAllowedTables,
  describeTable,
  estimateQueryCost,
  executeReadonlyQuery,
  searchAllowedTables,
} from './bigquery.js';

const server = new Server(
  {
    name: 'custom-bigquery-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_allowed_tables',
        description: 'List all BigQuery tables allowed for query execution.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'describe_table',
        description: 'Get detailed schema, column descriptions, and partitioning information for an allowed BigQuery table.',
        inputSchema: {
          type: 'object',
          properties: {
            datasetId: { type: 'string', description: 'BigQuery dataset ID' },
            tableId: { type: 'string', description: 'BigQuery table ID' },
          },
          required: ['datasetId', 'tableId'],
        },
      },
      {
        name: 'estimate_query_cost',
        description: 'Estimate bytes scanned and projected cost in USD for a read-only SQL query without executing it.',
        inputSchema: {
          type: 'object',
          properties: {
            sql: { type: 'string', description: 'Read-only SQL query to dry-run' },
          },
          required: ['sql'],
        },
      },
      {
        name: 'execute_readonly_query',
        description: 'Execute a read-only BigQuery SQL query against allowed tables.',
        inputSchema: {
          type: 'object',
          properties: {
            sql: { type: 'string', description: 'Read-only SELECT query' },
          },
          required: ['sql'],
        },
      },
      {
        name: 'search_allowed_tables',
        description: "Search allowed tables and their schemas by a keyword (e.g., 'transaction', 'customer'). Returns table description, partitioning columns, clustering columns, and field schemas in one call.",
        inputSchema: {
          type: 'object',
          properties: {
            keyword: {
              type: 'string',
              description: 'The search keyword to filter table names and datasets',
            },
          },
          required: ['keyword'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const safeArgs: Record<string, any> = args || {};

  try {
    switch (name) {
      case 'list_allowed_tables': {
        const result = await listAllowedTables();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'describe_table': {
        if (!safeArgs.datasetId || !safeArgs.tableId) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Missing required parameters: datasetId and tableId are required.'
          );
        }
        const result = await describeTable(safeArgs.datasetId, safeArgs.tableId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'estimate_query_cost': {
        if (!safeArgs.sql) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Missing required parameter: sql is required.'
          );
        }
        const result = await estimateQueryCost(safeArgs.sql);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'execute_readonly_query': {
        if (!safeArgs.sql) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Missing required parameter: sql is required.'
          );
        }
        const result = await executeReadonlyQuery(safeArgs.sql);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.rows, null, 2),
            },
          ],
        };
      }

      case 'search_allowed_tables': {
        if (!safeArgs.keyword) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Missing required parameter: keyword is required.'
          );
        }
        const result = await searchAllowedTables(safeArgs.keyword);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Tool "${name}" is not implemented by custom-bigquery-mcp.`
        );
    }
  } catch (error: any) {
    if (error instanceof McpError) {
      throw error;
    }
    return {
      content: [
        {
          type: 'text',
          text: error.message || 'Unknown error occurred in custom-bigquery-mcp.',
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[custom-bigquery-mcp] Server running on stdio');
}

main().catch((err) => {
  console.error('[custom-bigquery-mcp] Fatal error:', err);
  process.exit(1);
});
