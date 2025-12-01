import crypto from 'node:crypto';
import { runQuery } from '../utils/sqlClient';

export interface DatapointConfigurationInput {
  label?: string | null;
  userEmail: string;
  userName?: string | null;
  clientId: string;
  clientName: string;
  companyName?: string | null;
  sourceAccountId?: string | null;
  sourceAccountName?: string | null;
  sourceAccountDescription?: string | null;
  reportingPeriod?: string | null;
  mappingType?: string | null;
  targetSCoA?: string | null;
  polarity?: string | null;
  preset?: string | null;
  operations?: string[];
  exclusions?: string[];
  configuration?: Record<string, unknown> | null;
}

export interface DatapointConfigurationUpdate
  extends DatapointConfigurationInput {
  id: string;
}

export interface UserDatapointConfiguration
  extends Omit<DatapointConfigurationInput, 'configuration'> {
  id: string;
  configuration: Record<string, unknown> | null;
  operations: string[];
  exclusions: string[];
  createdAt: string;
  updatedAt: string;
}

const TABLE_NAME = 'MAPLEDGER_USER_DATAPOINTS';

let ensureTablePromise: Promise<void> | null = null;

const SELECT_COLUMNS = `
  ID AS id,
  USER_EMAIL AS user_email,
  USER_NAME AS user_name,
  CLIENT_ID AS client_id,
  CLIENT_NAME AS client_name,
  CONFIGURATION_LABEL AS configuration_label,
  COMPANY_NAME AS company_name,
  SOURCE_ACCOUNT_ID AS source_account_id,
  SOURCE_ACCOUNT_NAME AS source_account_name,
  SOURCE_ACCOUNT_DESCRIPTION AS source_account_description,
  REPORTING_PERIOD AS reporting_period,
  MAPPING_TYPE AS mapping_type,
  TARGET_SCOA AS target_scoa,
  POLARITY AS polarity,
  PRESET AS preset,
  OPERATIONS_JSON AS operations_json,
  EXCLUSIONS_JSON AS exclusions_json,
  CONFIGURATION_JSON AS configuration_json,
  CREATED_AT AS created_at,
  UPDATED_DTTM AS updated_dttm
`;

type RawDatapointConfigurationRow = {
  id: string;
  user_email: string;
  user_name: string | null;
  client_id: string;
  client_name: string;
  configuration_label: string | null;
  company_name: string | null;
  source_account_id: string | null;
  source_account_name: string | null;
  source_account_description: string | null;
  reporting_period: string | null;
  mapping_type: string | null;
  target_scoa: string | null;
  polarity: string | null;
  preset: string | null;
  operations_json: string | null;
  exclusions_json: string | null;
  configuration_json: string | null;
  created_at: Date;
  updated_dttm: Date;
};

const toNullableString = (value?: string | null): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const normalizeStringArray = (values?: string[] | null): string[] => {
  if (!values || values.length === 0) {
    return [];
  }

  const normalized = values
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b));
};

const serializeArray = (values?: string[] | null): string =>
  JSON.stringify(normalizeStringArray(values ?? []));

const serializeConfiguration = (
  configuration?: Record<string, unknown> | null
): string | null => {
  if (configuration === undefined || configuration === null) {
    return null;
  }

  return JSON.stringify(configuration);
};

const parseJsonArray = (value: string | null): string[] => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return normalizeStringArray(
      parsed.map((entry) =>
        typeof entry === 'string' ? entry : JSON.stringify(entry)
      )
    );
  } catch (error) {
    return [];
  }
};

const parseJsonObject = (
  value: string | null
): Record<string, unknown> | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }

    return null;
  } catch (error) {
    return null;
  }
};

const ensureTableExists = async (): Promise<void> => {
  if (!ensureTablePromise) {
    ensureTablePromise = runQuery(
      `IF OBJECT_ID('dbo.${TABLE_NAME}', 'U') IS NULL BEGIN SELECT 1 END;`
    ).then(() => undefined);
  }

  return ensureTablePromise;
};

const mapRowToConfiguration = (
  row: RawDatapointConfigurationRow
): UserDatapointConfiguration => ({
  id: row.id,
  label: row.configuration_label,
  userEmail: row.user_email,
  userName: row.user_name,
  clientId: row.client_id,
  clientName: row.client_name,
  companyName: row.company_name,
  sourceAccountId: row.source_account_id,
  sourceAccountName: row.source_account_name,
  sourceAccountDescription: row.source_account_description,
  reportingPeriod: row.reporting_period,
  mappingType: row.mapping_type,
  targetSCoA: row.target_scoa,
  polarity: row.polarity,
  preset: row.preset,
  operations: parseJsonArray(row.operations_json),
  exclusions: parseJsonArray(row.exclusions_json),
  configuration: parseJsonObject(row.configuration_json),
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_dttm.toISOString(),
});

export const listDatapointConfigurations = async (
  email: string,
  clientId?: string
): Promise<UserDatapointConfiguration[]> => {
  const normalizedEmail = normalizeEmail(email);
  await ensureTableExists();
  const filters: string[] = ['USER_EMAIL = @email'];
  const parameters: Record<string, unknown> = { email: normalizedEmail };

  if (clientId) {
    filters.push('CLIENT_ID = @clientId');
    parameters.clientId = clientId;
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const { recordset = [] } = await runQuery<RawDatapointConfigurationRow>(
    `SELECT ${SELECT_COLUMNS}
     FROM dbo.${TABLE_NAME} ${whereClause}
     ORDER BY UPDATED_DTTM DESC`,
    parameters
  );

  return recordset.map(mapRowToConfiguration);
};

export const createDatapointConfiguration = async (
  input: DatapointConfigurationInput
): Promise<UserDatapointConfiguration> => {
  const id = crypto.randomUUID();
  const normalizedEmail = normalizeEmail(input.userEmail);

  await ensureTableExists();

  await runQuery(
    `INSERT INTO dbo.${TABLE_NAME} (
      ID,
      USER_EMAIL,
      USER_NAME,
      CLIENT_ID,
      CLIENT_NAME,
      CONFIGURATION_LABEL,
      COMPANY_NAME,
      SOURCE_ACCOUNT_ID,
      SOURCE_ACCOUNT_NAME,
      SOURCE_ACCOUNT_DESCRIPTION,
      REPORTING_PERIOD,
      MAPPING_TYPE,
      TARGET_SCOA,
      POLARITY,
      PRESET,
      OPERATIONS_JSON,
      EXCLUSIONS_JSON,
      CONFIGURATION_JSON
    ) VALUES (
      @id,
      @userEmail,
      @userName,
      @clientId,
      @clientName,
      @label,
      @companyName,
      @sourceAccountId,
      @sourceAccountName,
      @sourceAccountDescription,
      @reportingPeriod,
      @mappingType,
      @targetSCoA,
      @polarity,
      @preset,
      @operationsJson,
      @exclusionsJson,
      @configurationJson
    )`,
    {
      id,
      userEmail: normalizedEmail,
      userName: toNullableString(input.userName ?? null),
      clientId: input.clientId,
      clientName: input.clientName,
      label: toNullableString(input.label ?? null),
      companyName: toNullableString(input.companyName ?? null),
      sourceAccountId: toNullableString(input.sourceAccountId ?? null),
      sourceAccountName: toNullableString(input.sourceAccountName ?? null),
      sourceAccountDescription: toNullableString(
        input.sourceAccountDescription ?? null
      ),
      reportingPeriod: toNullableString(input.reportingPeriod ?? null),
      mappingType: toNullableString(input.mappingType ?? null),
      targetSCoA: toNullableString(input.targetSCoA ?? null),
      polarity: toNullableString(input.polarity ?? null),
      preset: toNullableString(input.preset ?? null),
      operationsJson: serializeArray(input.operations ?? []),
      exclusionsJson: serializeArray(input.exclusions ?? []),
      configurationJson: serializeConfiguration(input.configuration ?? null),
    }
  );

  return getDatapointConfigurationById(id);
};

export const updateDatapointConfiguration = async (
  input: DatapointConfigurationUpdate
): Promise<UserDatapointConfiguration> => {
  const normalizedEmail = normalizeEmail(input.userEmail);
  await ensureTableExists();
  const result = await runQuery(
    `UPDATE dbo.${TABLE_NAME}
    SET
      USER_NAME = @userName,
      CLIENT_ID = @clientId,
      CLIENT_NAME = @clientName,
      CONFIGURATION_LABEL = @label,
      COMPANY_NAME = @companyName,
      SOURCE_ACCOUNT_ID = @sourceAccountId,
      SOURCE_ACCOUNT_NAME = @sourceAccountName,
      SOURCE_ACCOUNT_DESCRIPTION = @sourceAccountDescription,
      REPORTING_PERIOD = @reportingPeriod,
      MAPPING_TYPE = @mappingType,
      TARGET_SCOA = @targetSCoA,
      POLARITY = @polarity,
      PRESET = @preset,
      OPERATIONS_JSON = @operationsJson,
      EXCLUSIONS_JSON = @exclusionsJson,
      CONFIGURATION_JSON = @configurationJson,
      UPDATED_DTTM = SYSUTCDATETIME()
    WHERE ID = @id AND USER_EMAIL = @userEmail`,
    {
      id: input.id,
      userEmail: normalizedEmail,
      userName: toNullableString(input.userName ?? null),
      clientId: input.clientId,
      clientName: input.clientName,
      label: toNullableString(input.label ?? null),
      companyName: toNullableString(input.companyName ?? null),
      sourceAccountId: toNullableString(input.sourceAccountId ?? null),
      sourceAccountName: toNullableString(input.sourceAccountName ?? null),
      sourceAccountDescription: toNullableString(
        input.sourceAccountDescription ?? null
      ),
      reportingPeriod: toNullableString(input.reportingPeriod ?? null),
      mappingType: toNullableString(input.mappingType ?? null),
      targetSCoA: toNullableString(input.targetSCoA ?? null),
      polarity: toNullableString(input.polarity ?? null),
      preset: toNullableString(input.preset ?? null),
      operationsJson: serializeArray(input.operations ?? []),
      exclusionsJson: serializeArray(input.exclusions ?? []),
      configurationJson: serializeConfiguration(input.configuration ?? null),
    }
  );

  const rowsAffected = (
    result as typeof result & { rowsAffected?: number[] }
  ).rowsAffected?.[0] ?? 0;
  if (rowsAffected === 0) {
    throw new Error('Datapoint configuration not found');
  }

  return getDatapointConfigurationById(input.id);
};

export const getDatapointConfigurationById = async (
  id: string
): Promise<UserDatapointConfiguration> => {
  await ensureTableExists();
  const { recordset = [] } = await runQuery<RawDatapointConfigurationRow>(
    `SELECT ${SELECT_COLUMNS}
     FROM dbo.${TABLE_NAME}
     WHERE ID = @id`,
    { id }
  );

  if (recordset.length === 0) {
    throw new Error('Datapoint configuration not found');
  }

  return mapRowToConfiguration(recordset[0]);
};

export const __resetDatapointConfigurationRepositoryForTests = (): void => {
  ensureTablePromise = null;
};
