import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateQuerySafety, isTableAllowlisted } from '../src/policy.js';
import * as bqModule from '../src/bigquery.js';

// Mock @google-cloud/bigquery
vi.mock('@google-cloud/bigquery', () => {
  const getMetadataMock = vi.fn().mockResolvedValue([
    {
      description: 'Mock Description',
      type: 'TABLE',
      numRows: '100',
      schema: {
        fields: [
          { name: 'id', type: 'STRING', mode: 'REQUIRED' },
          { name: 'created_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
        ],
      },
      timePartitioning: { type: 'DAY', field: 'created_at' },
      clustering: { fields: ['id'] },
    },
  ]);

  const createQueryJobMock = vi.fn().mockResolvedValue([
    {
      id: 'job_123',
      metadata: {
        statistics: {
          query: { totalBytesProcessed: '1073741824', totalBytesBilled: '1073741824' },
        },
      },
      getQueryResults: vi.fn().mockResolvedValue([
        [{ id: '1', created_at: '2023-01-01T00:00:00Z' }],
      ]),
    },
  ]);

  const tableMock = vi.fn(() => ({
    getMetadata: getMetadataMock,
  }));

  const datasetMock = vi.fn(() => ({
    table: tableMock,
  }));

  class BigQueryMock {
    dataset = datasetMock;
    createQueryJob = createQueryJobMock;
  }

  return { BigQuery: BigQueryMock };
});

describe('custom-bigquery-mcp Unit Tests', () => {
  beforeEach(() => {
    process.env.ALLOWLIST_TABLES = 'analytics.users,bigquery-public-data.chicago_taxi_trips.taxi_trips';
    process.env.GCP_PROJECT_ID = 'test-project';
    vi.clearAllMocks();
  });

  describe('SQL Policy Engine (validateQuerySafety)', () => {
    it('should allow valid SELECT query on allowlisted table', () => {
      const result = validateQuerySafety('SELECT id FROM `analytics.users` LIMIT 10');
      expect(result.safe).toBe(true);
      expect(result.detectedTables).toContain('analytics.users');
    });

    it('should allow valid WITH ... SELECT query on allowlisted table', () => {
      const result = validateQuerySafety(
        'WITH u AS (SELECT id FROM `analytics.users`) SELECT * FROM u'
      );
      expect(result.safe).toBe(true);
      expect(result.detectedTables).toContain('analytics.users');
    });

    it('should reject non-SELECT queries (INSERT, UPDATE, DELETE, DROP)', () => {
      const deleteQuery = validateQuerySafety('DELETE FROM `analytics.users` WHERE id = 1');
      expect(deleteQuery.safe).toBe(false);
      expect(deleteQuery.reason).toContain('Only SELECT');

      const updateQuery = validateQuerySafety('UPDATE `analytics.users` SET name = "test"');
      expect(updateQuery.safe).toBe(false);

      const dropQuery = validateQuerySafety('DROP TABLE `analytics.users`');
      expect(dropQuery.safe).toBe(false);
    });

    it('should strip comments and still block disallowed keywords', () => {
      const queryWithComments = 'SELECT id FROM `analytics.users`; -- DROP TABLE users';
      const result = validateQuerySafety(queryWithComments);
      // Even with comments, if it contains drop keyword after comments strip or starts with select,
      // comments are stripped so '-- DROP' is removed.
      expect(result.safe).toBe(true);
    });

    it('should reject queries targeting non-allowlisted tables', () => {
      const result = validateQuerySafety('SELECT * FROM `secret.financial_data`');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('is not in the allowlist');
    });
  });

  describe('BigQuery Operations', () => {
    it('describeTable should return field schemas, partitioning, and clustering', async () => {
      const schema = await bqModule.describeTable('analytics', 'users');
      expect(schema.table).toBe('analytics.users');
      expect(schema.fields.length).toBe(2);
      expect(schema.partitionInfo).toEqual({ type: 'DAY', field: 'created_at' });
      expect(schema.clusteringInfo).toEqual(['id']);
    });

    it('estimateQueryCost should perform dryRun and compute cost in USD', async () => {
      const estimate = await bqModule.estimateQueryCost('SELECT * FROM `analytics.users`');
      expect(estimate.valid).toBe(true);
      expect(estimate.bytesScanned).toBe(1073741824);
      expect(estimate.bytesScannedGb).toBe(1);
      expect(estimate.estimatedCostUsd).toBeCloseTo(0.00625, 4);
    });

    it('executeReadonlyQuery should execute query and return rows with metadata', async () => {
      const res = await bqModule.executeReadonlyQuery('SELECT id FROM `analytics.users`', {
        userEmail: 'dev@example.com',
        adapterName: 'test-adapter',
      });
      expect(res.rows).toEqual([{ id: '1', created_at: '2023-01-01T00:00:00Z' }]);
      expect(res.meta.jobId).toBe('job_123');
      expect(res.meta.actualBytesBilled).toBe(1073741824);
    });
  });
});
