import { runQuery } from '../utils/sqlClient';

export interface IndustryRecord {
  name: string;
  normalizedName: string;
  tableName: string;
}

export class IndustryAlreadyExistsError extends Error {
  code = 'industry_exists';

  constructor(message = 'Industry already exists.') {
    super(message);
    this.name = 'IndustryAlreadyExistsError';
  }
}

const TABLE_NAME = 'ML.INDUSTRIES';
const TABLE_NAME_PATTERN = /^ML\.[A-Z0-9_]+$/;

export const normalizeIndustryName = (value: string): string => {
  if (!value) {
    return '';
  }

  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
};

export const buildCoaTableName = (normalizedIndustry: string): string => {
  if (normalizedIndustry === 'TRUCKING') {
    return 'ML.CHART_OF_ACCOUNTS';
  }

  return `ML.${normalizedIndustry}_CHART_OF_ACCOUNTS`;
};

export const isSafeTableName = (value: string): boolean => {
  return TABLE_NAME_PATTERN.test(value.toUpperCase());
};

export const listIndustries = async (): Promise<IndustryRecord[]> => {
  const { recordset = [] } = await runQuery<{
    industry_name?: string | null;
    coa_table_name?: string | null;
  }>(
    `SELECT
      INDUSTRY_NAME AS industry_name,
      COA_TABLE_NAME AS coa_table_name
    FROM ${TABLE_NAME}
    ORDER BY INDUSTRY_NAME`,
  );

  return recordset.map((row) => {
    const name = row.industry_name?.trim() ?? '';
    const normalizedName = normalizeIndustryName(name);
    const tableName = row.coa_table_name?.trim() || buildCoaTableName(normalizedName);

    return {
      name,
      normalizedName,
      tableName,
    };
  });
};

export const createIndustry = async (name: string): Promise<IndustryRecord> => {
  const trimmed = name.trim();
  const normalizedName = normalizeIndustryName(trimmed);

  if (!trimmed || !normalizedName) {
    throw new Error('Industry name is required.');
  }

  const industries = await listIndustries();
  const duplicate = industries.find((industry) => industry.normalizedName === normalizedName);
  if (duplicate) {
    throw new IndustryAlreadyExistsError();
  }

  const tableName = buildCoaTableName(normalizedName);
  if (!isSafeTableName(tableName)) {
    throw new Error('Invalid industry table name.');
  }

  await runQuery(
    `INSERT INTO ${TABLE_NAME} (
      INDUSTRY_NAME,
      COA_TABLE_NAME
    ) VALUES (
      @name,
      @tableName
    )`,
    {
      name: trimmed,
      tableName,
    },
  );

  return {
    name: trimmed,
    normalizedName,
    tableName,
  };
};

export default listIndustries;
