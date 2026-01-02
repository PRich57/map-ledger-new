import { runQuery } from '../utils/sqlClient';
import {
  buildCoaTableName,
  isSafeTableName,
  listIndustries,
  normalizeIndustryName,
} from './industriesRepository';

export class IndustryNotFoundError extends Error {
  code = 'industry_not_found';

  constructor(message = 'Industry not found.') {
    super(message);
    this.name = 'IndustryNotFoundError';
  }
}

export class InvalidIndustryNameError extends Error {
  code = 'invalid_industry_name';

  constructor(message = 'Industry name is invalid.') {
    super(message);
    this.name = 'InvalidIndustryNameError';
  }
}

export class InvalidIndustryTableError extends Error {
  code = 'invalid_industry_table';

  constructor(message = 'Industry table configuration is invalid.') {
    super(message);
    this.name = 'InvalidIndustryTableError';
  }
}

export interface TableState {
  tableName: string;
  exists: boolean;
  columns: string[];
}

const COLUMN_NAME_PATTERN = /^[A-Z0-9_]+$/;
const DEFAULT_COLUMN_TYPE = 'VARCHAR(255)';
const COST_TYPE_COLUMN_TYPE = 'VARCHAR(50)';
const IS_FINANCIAL_COLUMN_TYPE = 'BIT';

const isSafeColumnName = (value: string): boolean => COLUMN_NAME_PATTERN.test(value);

const resolveIndustryTableName = async (industryName: string): Promise<string> => {
  const normalized = normalizeIndustryName(industryName);
  if (!normalized) {
    throw new InvalidIndustryNameError();
  }

  const industries = await listIndustries();
  const match = industries.find((industry) => industry.normalizedName === normalized);
  if (!match) {
    throw new IndustryNotFoundError();
  }

  const expectedTableName = buildCoaTableName(normalized);
  const resolvedTableName = match.tableName?.trim() || expectedTableName;
  if (!isSafeTableName(resolvedTableName)) {
    throw new InvalidIndustryTableError();
  }

  const allowlist = new Set(
    industries.map((industry) =>
      (industry.tableName?.trim() || buildCoaTableName(industry.normalizedName)).toUpperCase(),
    ),
  );
  if (!allowlist.has(resolvedTableName.toUpperCase())) {
    throw new InvalidIndustryTableError();
  }

  return resolvedTableName;
};

const splitTableName = (tableName: string): { schema: string; name: string } => {
  const [schema, name] = tableName.split('.');
  return { schema: schema ?? 'dbo', name: name ?? tableName };
};

export const getIndustryTableState = async (industryName: string): Promise<TableState> => {
  const tableName = await resolveIndustryTableName(industryName);
  const { schema, name } = splitTableName(tableName);

  const existsResult = await runQuery<{ exists_flag: number }>(
    `SELECT 1 AS exists_flag
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = @schema
       AND TABLE_NAME = @name`,
    {
      schema,
      name,
    },
  );

  const exists = (existsResult.recordset?.length ?? 0) > 0;
  if (!exists) {
    return { tableName, exists: false, columns: [] };
  }

  const { recordset = [] } = await runQuery<{ column_name: string }>(
    `SELECT COLUMN_NAME AS column_name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @schema
       AND TABLE_NAME = @name
     ORDER BY ORDINAL_POSITION`,
    {
      schema,
      name,
    },
  );

  return {
    tableName,
    exists: true,
    columns: recordset.map((row) => row.column_name.toUpperCase()),
  };
};

const formatColumnList = (columns: string[]): string =>
  columns.map((column) => `[${column}]`).join(', ');

const buildOpenJsonClause = (columns: string[]): string =>
  columns
    .map((column) => `  [${column}] NVARCHAR(255) '$.${column}'`)
    .join(',\n');

export const dropIndustryTable = async (tableName: string): Promise<void> => {
  await runQuery(
    `IF OBJECT_ID(@qualifiedName, 'U') IS NOT NULL
      BEGIN
        EXEC('DROP TABLE ${tableName}')
      END`,
    {
      qualifiedName: tableName,
    },
  );
};

export const createIndustryTable = async (
  tableName: string,
  columns: string[],
): Promise<void> => {
  const safeColumns = columns.filter(isSafeColumnName);
  const columnDefinitions = safeColumns.map((column) => `[${column}] ${DEFAULT_COLUMN_TYPE} NULL`);
  const allDefinitions = [
    '[RECORD_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY',
    ...columnDefinitions,
    `[COST_TYPE] ${COST_TYPE_COLUMN_TYPE} NULL`,
    `[IS_FINANCIAL] ${IS_FINANCIAL_COLUMN_TYPE} NULL`,
  ];

  const sql = `CREATE TABLE ${tableName} (
    ${allDefinitions.join(',\n    ')}
  )`;

  await runQuery(sql);
};

export const addColumns = async (tableName: string, columns: string[]): Promise<void> => {
  if (columns.length === 0) {
    return;
  }

  const safeColumns = columns.filter(isSafeColumnName);
  if (safeColumns.length === 0) {
    return;
  }

  const sql = `ALTER TABLE ${tableName}
    ADD ${safeColumns.map((column) => `[${column}] ${DEFAULT_COLUMN_TYPE} NULL`).join(', ')}`;

  await runQuery(sql);
};

export const dropColumns = async (tableName: string, columns: string[]): Promise<void> => {
  if (columns.length === 0) {
    return;
  }

  const safeColumns = columns.filter(isSafeColumnName);
  if (safeColumns.length === 0) {
    return;
  }

  const sql = `ALTER TABLE ${tableName}
    DROP COLUMN ${safeColumns.map((column) => `[${column}]`).join(', ')}`;

  await runQuery(sql);
};

export const ensureCostTypeColumn = async (tableName: string): Promise<void> => {
  await runQuery(
    `IF NOT EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = PARSENAME(@tableName, 2)
        AND TABLE_NAME = PARSENAME(@tableName, 1)
        AND COLUMN_NAME = 'COST_TYPE'
    )
    BEGIN
      EXEC('ALTER TABLE ${tableName} ADD [COST_TYPE] ${COST_TYPE_COLUMN_TYPE} NULL')
    END`,
    {
      tableName,
    },
  );
};

export const ensureIsFinancialColumn = async (tableName: string): Promise<void> => {
  await runQuery(
    `IF NOT EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = PARSENAME(@tableName, 2)
        AND TABLE_NAME = PARSENAME(@tableName, 1)
        AND COLUMN_NAME = 'IS_FINANCIAL'
    )
    BEGIN
      EXEC('ALTER TABLE ${tableName} ADD [IS_FINANCIAL] ${IS_FINANCIAL_COLUMN_TYPE} NULL')
    END`,
    {
      tableName,
    },
  );
};

export const insertRows = async (
  tableName: string,
  columns: string[],
  rows: Record<string, string | null>[],
): Promise<void> => {
  if (rows.length === 0) {
    return;
  }

  const safeColumns = columns.filter(isSafeColumnName);
  const jsonPayload = JSON.stringify(rows);
  const columnList = formatColumnList(safeColumns);
  const withClause = buildOpenJsonClause(safeColumns);

  const sql = `DECLARE @payload NVARCHAR(MAX) = @jsonPayload;

    WITH SourceRows AS (
      SELECT *
      FROM OPENJSON(@payload)
      WITH (
${withClause}
      )
    )
    INSERT INTO ${tableName} (${columnList})
    SELECT ${columnList}
    FROM SourceRows;`;

  await runQuery(sql, { jsonPayload });
};

export const upsertRows = async (
  tableName: string,
  columns: string[],
  keyColumns: string[],
  rows: Record<string, string | null>[],
): Promise<void> => {
  if (rows.length === 0) {
    return;
  }

  const safeColumns = columns.filter(isSafeColumnName);
  const safeKeyColumns = keyColumns.filter(isSafeColumnName);
  const updateColumns = safeColumns.filter((column) => !safeKeyColumns.includes(column));
  const jsonPayload = JSON.stringify(rows);
  const columnList = formatColumnList(safeColumns);
  const withClause = buildOpenJsonClause(safeColumns);
  const mergeCondition = safeKeyColumns
    .map((column) => `TARGET.[${column}] = SOURCE.[${column}]`)
    .join(' AND ');
  const updateSet = updateColumns
    .map((column) => `TARGET.[${column}] = SOURCE.[${column}]`)
    .join(', ');

  const updateClause = updateColumns.length > 0 ? `WHEN MATCHED THEN UPDATE SET ${updateSet}` : '';

  const sql = `DECLARE @payload NVARCHAR(MAX) = @jsonPayload;

    WITH SourceRows AS (
      SELECT *
      FROM OPENJSON(@payload)
      WITH (
${withClause}
      )
    )
    MERGE ${tableName} AS TARGET
    USING SourceRows AS SOURCE
      ON ${mergeCondition}
    ${updateClause}
    WHEN NOT MATCHED THEN
      INSERT (${columnList})
      VALUES (${columnList});`;

  await runQuery(sql, { jsonPayload });
};

export const deleteMissingRows = async (
  tableName: string,
  keyColumns: string[],
  rows: Record<string, string | null>[],
): Promise<void> => {
  if (rows.length === 0) {
    return;
  }

  const safeKeyColumns = keyColumns.filter(isSafeColumnName);
  const jsonPayload = JSON.stringify(rows.map((row) => {
    const filtered: Record<string, string | null> = {};
    safeKeyColumns.forEach((column) => {
      filtered[column] = row[column] ?? null;
    });
    return filtered;
  }));

  const withClause = buildOpenJsonClause(safeKeyColumns);
  const joinCondition = safeKeyColumns
    .map((column) => `TARGET.[${column}] = SOURCE.[${column}]`)
    .join(' AND ');

  const sql = `DECLARE @payload NVARCHAR(MAX) = @jsonPayload;

    WITH SourceRows AS (
      SELECT *
      FROM OPENJSON(@payload)
      WITH (
${withClause}
      )
    )
    DELETE TARGET
    FROM ${tableName} AS TARGET
    WHERE NOT EXISTS (
      SELECT 1
      FROM SourceRows AS SOURCE
      WHERE ${joinCondition}
    );`;

  await runQuery(sql, { jsonPayload });
};

export const detectMissingRows = async (
  tableName: string,
  keyColumns: string[],
  rows: Record<string, string | null>[],
): Promise<{ count: number; sample: Record<string, string | null>[] }> => {
  if (rows.length === 0) {
    return { count: 0, sample: [] };
  }

  const safeKeyColumns = keyColumns.filter(isSafeColumnName);
  if (safeKeyColumns.length === 0) {
    return { count: 0, sample: [] };
  }

  const jsonPayload = JSON.stringify(rows.map((row) => {
    const filtered: Record<string, string | null> = {};
    safeKeyColumns.forEach((column) => {
      filtered[column] = row[column] ?? null;
    });
    return filtered;
  }));

  const withClause = buildOpenJsonClause(safeKeyColumns);
  const joinCondition = safeKeyColumns
    .map((column) => `TARGET.[${column}] = SOURCE.[${column}]`)
    .join(' AND ');

  const countSql = `DECLARE @payload NVARCHAR(MAX) = @jsonPayload;

    WITH SourceRows AS (
      SELECT *
      FROM OPENJSON(@payload)
      WITH (
${withClause}
      )
    )
    SELECT COUNT(*) AS missing_count
    FROM ${tableName} AS TARGET
    WHERE NOT EXISTS (
      SELECT 1
      FROM SourceRows AS SOURCE
      WHERE ${joinCondition}
    );`;

  const countResult = await runQuery<{ missing_count: number }>(countSql, { jsonPayload });
  const count = countResult.recordset?.[0]?.missing_count ?? 0;

  const sampleSql = `DECLARE @payload NVARCHAR(MAX) = @jsonPayload;

    WITH SourceRows AS (
      SELECT *
      FROM OPENJSON(@payload)
      WITH (
${withClause}
      )
    )
    SELECT TOP 10 ${formatColumnList(safeKeyColumns)}
    FROM ${tableName} AS TARGET
    WHERE NOT EXISTS (
      SELECT 1
      FROM SourceRows AS SOURCE
      WHERE ${joinCondition}
    );`;

  const sampleResult = await runQuery<Record<string, string | null>>(sampleSql, { jsonPayload });

  return {
    count,
    sample: sampleResult.recordset ?? [],
  };
};
