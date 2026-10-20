import dotenv from 'dotenv';

dotenv.config();

/**
 * Checks if a table is present in ALLOWLIST_TABLES.
 * Supports both `dataset.table` and `project.dataset.table` formats.
 */
export const isTableAllowlisted = (datasetId: string, tableId: string): boolean => {
  const allowlist = (process.env.ALLOWLIST_TABLES || '')
    .split(',')
    .map(s => s.replace(/\s+/g, '').toLowerCase())
    .filter(Boolean);
  const targetName = `${datasetId}.${tableId}`.toLowerCase();

  return allowlist.some(allowed => {
    const parts = allowed.split('.');
    const allowedDataset = parts.length === 3 ? parts[1] : parts[0];
    const allowedTable = parts.length === 3 ? parts[2] : parts[1];
    return `${allowedDataset}.${allowedTable}` === targetName;
  });
};

/**
 * Validates SQL query safety:
 * 1. Strips comments (block and inline).
 * 2. Enforces read-only SELECT or WITH ... SELECT queries.
 * 3. Blocks forbidden DDL/DML/scripting keywords.
 * 4. Ensures referenced tables are explicitly listed in the allowlist.
 */
export const validateQuerySafety = (
  sql: string
): { safe: boolean; reason?: string; detectedTables: string[] } => {
  const cleanSql = sql.trim().toLowerCase();

  // 1. Remove comments to prevent evasion
  const sqlWithoutComments = cleanSql.replace(/\/\*(?:\*[^\/]|[^*])*\*\/|--.*/g, '').trim();

  // 2. Strip backticks to simplify regex matching
  const sqlCleaned = sqlWithoutComments.replace(/`/g, '');

  // Matches dataset.table or project.dataset.table
  const pattern = /\b([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)(?:\.([a-zA-Z0-9_-]+))?\b/g;
  let match: RegExpExecArray | null;
  const detectedTables: string[] = [];
  while ((match = pattern.exec(sqlCleaned)) !== null) {
    const dataset = match[3] ? match[2] : match[1];
    const table = match[3] ? match[3] : match[2];
    detectedTables.push(`${dataset}.${table}`);
  }

  // 3. Must start with SELECT or WITH
  if (!sqlWithoutComments.startsWith('select') && !sqlWithoutComments.startsWith('with')) {
    return {
      safe: false,
      reason: 'Only SELECT (or WITH ... SELECT) queries are allowed.',
      detectedTables,
    };
  }

  // 4. Denylist mutative / scripting keywords
  const forbiddenKeywords = [
    'insert', 'update', 'delete', 'merge', 'create', 'drop', 'alter',
    'truncate', 'grant', 'revoke', 'declare', 'execute immediate', 'call'
  ];
  for (const word of forbiddenKeywords) {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    if (regex.test(sqlWithoutComments)) {
      return {
        safe: false,
        reason: `Query contains forbidden keyword: "${word}"`,
        detectedTables,
      };
    }
  }

  // 5. Table Allowlist verification
  if (detectedTables.length === 0) {
    return {
      safe: false,
      reason: 'Unable to detect referenced table. Ensure table format is `dataset.table` or `project.dataset.table`.',
      detectedTables,
    };
  }

  for (const table of detectedTables) {
    const parts = table.split('.');
    if (!isTableAllowlisted(parts[0], parts[1])) {
      return {
        safe: false,
        reason: `Rejected: Table "${table}" is not in the allowlist.`,
        detectedTables,
      };
    }
  }

  return { safe: true, detectedTables };
};
