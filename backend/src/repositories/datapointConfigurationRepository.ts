import crypto from 'node:crypto';

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

const inMemoryStore = new Map<string, UserDatapointConfiguration>();

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

const cloneConfiguration = (
  config: UserDatapointConfiguration
): UserDatapointConfiguration => ({
  ...config,
  operations: [...config.operations],
  exclusions: [...config.exclusions],
  configuration: config.configuration
    ? { ...config.configuration }
    : null,
});

const applyInputToConfiguration = (
  base: UserDatapointConfiguration,
  input: DatapointConfigurationInput,
  timestamps: { createdAt?: string; updatedAt: string }
): UserDatapointConfiguration => ({
  id: base.id,
  label: toNullableString(input.label),
  userEmail: normalizeEmail(input.userEmail),
  userName: toNullableString(input.userName ?? base.userName ?? null),
  clientId: input.clientId,
  clientName: input.clientName,
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
  operations: normalizeStringArray(input.operations ?? base.operations),
  exclusions: normalizeStringArray(input.exclusions ?? base.exclusions),
  configuration:
    input.configuration === undefined
      ? base.configuration
      : input.configuration ?? null,
  createdAt: timestamps.createdAt ?? base.createdAt,
  updatedAt: timestamps.updatedAt,
});

export const listDatapointConfigurations = async (
  email: string,
  clientId?: string
): Promise<UserDatapointConfiguration[]> => {
  const normalizedEmail = normalizeEmail(email);
  const results = Array.from(inMemoryStore.values()).filter((config) => {
    if (config.userEmail !== normalizedEmail) {
      return false;
    }
    if (clientId && config.clientId !== clientId) {
      return false;
    }
    return true;
  });

  return results
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(cloneConfiguration);
};

export const createDatapointConfiguration = async (
  input: DatapointConfigurationInput
): Promise<UserDatapointConfiguration> => {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const base: UserDatapointConfiguration = {
    id,
    label: null,
    userEmail: normalizeEmail(input.userEmail),
    userName: null,
    clientId: input.clientId,
    clientName: input.clientName,
    companyName: null,
    sourceAccountId: null,
    sourceAccountName: null,
    sourceAccountDescription: null,
    reportingPeriod: null,
    mappingType: null,
    targetSCoA: null,
    polarity: null,
    preset: null,
    operations: [],
    exclusions: [],
    configuration: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const record = applyInputToConfiguration(base, input, {
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  inMemoryStore.set(id, record);
  return cloneConfiguration(record);
};

export const updateDatapointConfiguration = async (
  input: DatapointConfigurationUpdate
): Promise<UserDatapointConfiguration> => {
  const existing = inMemoryStore.get(input.id);

  if (!existing) {
    throw new Error('Datapoint configuration not found');
  }

  const normalizedEmail = normalizeEmail(input.userEmail);
  if (existing.userEmail !== normalizedEmail) {
    throw new Error('Datapoint configuration not found');
  }

  const timestamp = new Date().toISOString();
  const updated = applyInputToConfiguration(existing, input, {
    createdAt: existing.createdAt,
    updatedAt: timestamp,
  });

  inMemoryStore.set(existing.id, updated);
  return cloneConfiguration(updated);
};

export const getDatapointConfigurationById = async (
  id: string
): Promise<UserDatapointConfiguration> => {
  const record = inMemoryStore.get(id);

  if (!record) {
    throw new Error('Datapoint configuration not found');
  }

  return cloneConfiguration(record);
};

/*
 * Original SQL-backed implementation retained for future reactivation.
 * import crypto from 'node:crypto';
 * import { runQuery } from '../utils/sqlClient';
 * 
 * const TABLE_NAME = 'MAPLEDGER_USER_DATAPOINTS';
 * 
 * const SELECT_COLUMNS = `
 *   ID AS id,
 *   USER_EMAIL AS user_email,
 *   USER_NAME AS user_name,
 *   CLIENT_ID AS client_id,
 *   CLIENT_NAME AS client_name,
 *   CONFIGURATION_LABEL AS configuration_label,
 *   COMPANY_NAME AS company_name,
 *   SOURCE_ACCOUNT_ID AS source_account_id,
 *   SOURCE_ACCOUNT_NAME AS source_account_name,
 *   SOURCE_ACCOUNT_DESCRIPTION AS source_account_description,
 *   REPORTING_PERIOD AS reporting_period,
 *   MAPPING_TYPE AS mapping_type,
 *   TARGET_SCOA AS target_scoa,
 *   POLARITY AS polarity,
 *   PRESET AS preset,
 *   OPERATIONS_JSON AS operations_json,
 *   EXCLUSIONS_JSON AS exclusions_json,
 *   CONFIGURATION_JSON AS configuration_json,
 *   CREATED_AT AS created_at,
 *   UPDATED_AT AS updated_at
 * `;
 * 
 * interface RawDatapointConfigurationRow extends Record<string, unknown> {
 *   id: string;
 *   user_email: string;
 *   user_name: string | null;
 *   client_id: string;
 *   client_name: string;
 *   configuration_label: string | null;
 *   company_name: string | null;
 *   source_account_id: string | null;
 *   source_account_name: string | null;
 *   source_account_description: string | null;
 *   reporting_period: string | null;
 *   mapping_type: string | null;
 *   target_scoa: string | null;
 *   polarity: string | null;
 *   preset: string | null;
 *   operations_json: string | null;
 *   exclusions_json: string | null;
 *   configuration_json: string | null;
 *   created_at: Date;
 *   updated_at: Date;
 * }
 * 
 * export interface DatapointConfigurationInput {
 *   label?: string | null;
 *   userEmail: string;
 *   userName?: string | null;
 *   clientId: string;
 *   clientName: string;
 *   companyName?: string | null;
 *   sourceAccountId?: string | null;
 *   sourceAccountName?: string | null;
 *   sourceAccountDescription?: string | null;
 *   reportingPeriod?: string | null;
 *   mappingType?: string | null;
 *   targetSCoA?: string | null;
 *   polarity?: string | null;
 *   preset?: string | null;
 *   operations?: string[];
 *   exclusions?: string[];
 *   configuration?: Record<string, unknown> | null;
 * }
 * 
 * export interface DatapointConfigurationUpdate
 *   extends DatapointConfigurationInput {
 *   id: string;
 * }
 * 
 * export interface UserDatapointConfiguration
 *   extends Omit<DatapointConfigurationInput, 'configuration'> {
 *   id: string;
 *   configuration: Record<string, unknown> | null;
 *   operations: string[];
 *   exclusions: string[];
 *   createdAt: string;
 *   updatedAt: string;
 * }
 * 
 * let tableEnsured = false;
 * 
 * const ensureTable = async () => {
 *   if (tableEnsured) {
 *     return;
 *   }
 * 
 *   await runQuery(
 *     `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = '${TABLE_NAME}')
 * BEGIN
 *   CREATE TABLE dbo.${TABLE_NAME} (
 *     ID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
 *     USER_EMAIL NVARCHAR(256) NOT NULL,
 *     USER_NAME NVARCHAR(256) NULL,
 *     CLIENT_ID NVARCHAR(128) NOT NULL,
 *     CLIENT_NAME NVARCHAR(256) NOT NULL,
 *     CONFIGURATION_LABEL NVARCHAR(256) NULL,
 *     COMPANY_NAME NVARCHAR(256) NULL,
 *     SOURCE_ACCOUNT_ID NVARCHAR(128) NULL,
 *     SOURCE_ACCOUNT_NAME NVARCHAR(256) NULL,
 *     SOURCE_ACCOUNT_DESCRIPTION NVARCHAR(MAX) NULL,
 *     REPORTING_PERIOD NVARCHAR(64) NULL,
 *     MAPPING_TYPE NVARCHAR(128) NULL,
 *     TARGET_SCOA NVARCHAR(128) NULL,
 *     POLARITY NVARCHAR(64) NULL,
 *     PRESET NVARCHAR(128) NULL,
 *     OPERATIONS_JSON NVARCHAR(MAX) NULL,
 *     EXCLUSIONS_JSON NVARCHAR(MAX) NULL,
 *     CONFIGURATION_JSON NVARCHAR(MAX) NULL,
 *     CREATED_AT DATETIME2(7) NOT NULL DEFAULT SYSUTCDATETIME(),
 *     UPDATED_AT DATETIME2(7) NOT NULL DEFAULT SYSUTCDATETIME()
 *   );
 *   CREATE INDEX IX_${TABLE_NAME}_USER_EMAIL_CLIENT_ID
 *     ON dbo.${TABLE_NAME}(USER_EMAIL, CLIENT_ID);
 * END;`
 *   );
 * 
 *   tableEnsured = true;
 * };
 * 
 * const parseJsonArray = (value: string | null): string[] => {
 *   if (!value) {
 *     return [];
 *   }
 * 
 *   try {
 *     const parsed = JSON.parse(value);
 *     if (Array.isArray(parsed)) {
 *       const normalized = parsed
 *         .map((entry) =>
 *           typeof entry === 'string' ? entry : JSON.stringify(entry)
 *         )
 *         .map((entry) => entry.trim())
 *         .filter((entry) => entry.length > 0);
 *       return Array.from(new Set(normalized)).sort((a, b) =>
 *         a.localeCompare(b)
 *       );
 *     }
 *     return [];
 *   } catch (error) {
 *     return [];
 *   }
 * };
 * 
 * const parseJsonObject = (
 *   value: string | null
 * ): Record<string, unknown> | null => {
 *   if (!value) {
 *     return null;
 *   }
 * 
 *   try {
 *     const parsed = JSON.parse(value);
 *     if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
 *       return parsed as Record<string, unknown>;
 *     }
 *     return null;
 *   } catch (error) {
 *     return null;
 *   }
 * };
 * 
 * const mapRowToConfiguration = (
 *   row: RawDatapointConfigurationRow
 * ): UserDatapointConfiguration => ({
 *   id: row.id,
 *   label: row.configuration_label,
 *   userEmail: row.user_email,
 *   userName: row.user_name,
 *   clientId: row.client_id,
 *   clientName: row.client_name,
 *   companyName: row.company_name,
 *   sourceAccountId: row.source_account_id,
 *   sourceAccountName: row.source_account_name,
 *   sourceAccountDescription: row.source_account_description,
 *   reportingPeriod: row.reporting_period,
 *   mappingType: row.mapping_type,
 *   targetSCoA: row.target_scoa,
 *   polarity: row.polarity,
 *   preset: row.preset,
 *   operations: parseJsonArray(row.operations_json),
 *   exclusions: parseJsonArray(row.exclusions_json),
 *   configuration: parseJsonObject(row.configuration_json),
 *   createdAt: row.created_at.toISOString(),
 *   updatedAt: row.updated_at.toISOString(),
 * });
 * 
 * export const listDatapointConfigurations = async (
 *   email: string,
 *   clientId?: string
 * ): Promise<UserDatapointConfiguration[]> => {
 *   await ensureTable();
 * 
 *   const filters: string[] = ['USER_EMAIL = @email'];
 *   const parameters: Record<string, unknown> = { email };
 * 
 *   if (clientId) {
 *     filters.push('CLIENT_ID = @clientId');
 *     parameters.clientId = clientId;
 *   }
 * 
 *   const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
 * 
 *   const { recordset = [] } = await runQuery<RawDatapointConfigurationRow>(
 *     `SELECT ${SELECT_COLUMNS}
 *      FROM dbo.${TABLE_NAME} ${whereClause}
 *      ORDER BY UPDATED_AT DESC`,
 *     parameters
 *   );
 * 
 *   return recordset.map(mapRowToConfiguration);
 * };
 * 
 * export const createDatapointConfiguration = async (
 *   input: DatapointConfigurationInput
 * ): Promise<UserDatapointConfiguration> => {
 *   await ensureTable();
 * 
 *   const id = crypto.randomUUID();
 * 
 *   await runQuery(
 *     `INSERT INTO dbo.${TABLE_NAME} (
 *       ID,
 *       USER_EMAIL,
 *       USER_NAME,
 *       CLIENT_ID,
 *       CLIENT_NAME,
 *       CONFIGURATION_LABEL,
 *       COMPANY_NAME,
 *       SOURCE_ACCOUNT_ID,
 *       SOURCE_ACCOUNT_NAME,
 *       SOURCE_ACCOUNT_DESCRIPTION,
 *       REPORTING_PERIOD,
 *       MAPPING_TYPE,
 *       TARGET_SCOA,
 *       POLARITY,
 *       PRESET,
 *       OPERATIONS_JSON,
 *       EXCLUSIONS_JSON,
 *       CONFIGURATION_JSON
 *     ) VALUES (
 *       @id,
 *       @userEmail,
 *       @userName,
 *       @clientId,
 *       @clientName,
 *       @label,
 *       @companyName,
 *       @sourceAccountId,
 *       @sourceAccountName,
 *       @sourceAccountDescription,
 *       @reportingPeriod,
 *       @mappingType,
 *       @targetSCoA,
 *       @polarity,
 *       @preset,
 *       @operationsJson,
 *       @exclusionsJson,
 *       @configurationJson
 *     )`,
 *     {
 *       id,
 *       userEmail: input.userEmail,
 *       userName: input.userName ?? null,
 *       clientId: input.clientId,
 *       clientName: input.clientName,
 *       label: input.label ?? null,
 *       companyName: input.companyName ?? null,
 *       sourceAccountId: input.sourceAccountId ?? null,
 *       sourceAccountName: input.sourceAccountName ?? null,
 *       sourceAccountDescription: input.sourceAccountDescription ?? null,
 *       reportingPeriod: input.reportingPeriod ?? null,
 *       mappingType: input.mappingType ?? null,
 *       targetSCoA: input.targetSCoA ?? null,
 *       polarity: input.polarity ?? null,
 *       preset: input.preset ?? null,
 *       operationsJson: JSON.stringify(input.operations ?? []),
 *       exclusionsJson: JSON.stringify(input.exclusions ?? []),
 *       configurationJson: JSON.stringify(input.configuration ?? {}),
 *     }
 *   );
 * 
 *   return getDatapointConfigurationById(id);
 * };
 * 
 * export const updateDatapointConfiguration = async (
 *   input: DatapointConfigurationUpdate
 * ): Promise<UserDatapointConfiguration> => {
 *   await ensureTable();
 * 
 *   await runQuery(
 *     `UPDATE dbo.${TABLE_NAME}
 *     SET
 *       USER_NAME = @userName,
 *       CLIENT_ID = @clientId,
 *       CLIENT_NAME = @clientName,
 *       CONFIGURATION_LABEL = @label,
 *       COMPANY_NAME = @companyName,
 *       SOURCE_ACCOUNT_ID = @sourceAccountId,
 *       SOURCE_ACCOUNT_NAME = @sourceAccountName,
 *       SOURCE_ACCOUNT_DESCRIPTION = @sourceAccountDescription,
 *       REPORTING_PERIOD = @reportingPeriod,
 *       MAPPING_TYPE = @mappingType,
 *       TARGET_SCOA = @targetSCoA,
 *       POLARITY = @polarity,
 *       PRESET = @preset,
 *       OPERATIONS_JSON = @operationsJson,
 *       EXCLUSIONS_JSON = @exclusionsJson,
 *       CONFIGURATION_JSON = @configurationJson,
 *       UPDATED_AT = SYSUTCDATETIME()
 *     WHERE ID = @id AND USER_EMAIL = @userEmail`,
 *     {
 *       id: input.id,
 *       userEmail: input.userEmail,
 *       userName: input.userName ?? null,
 *       clientId: input.clientId,
 *       clientName: input.clientName,
 *       label: input.label ?? null,
 *       companyName: input.companyName ?? null,
 *       sourceAccountId: input.sourceAccountId ?? null,
 *       sourceAccountName: input.sourceAccountName ?? null,
 *       sourceAccountDescription: input.sourceAccountDescription ?? null,
 *       reportingPeriod: input.reportingPeriod ?? null,
 *       mappingType: input.mappingType ?? null,
 *       targetSCoA: input.targetSCoA ?? null,
 *       polarity: input.polarity ?? null,
 *       preset: input.preset ?? null,
 *       operationsJson: JSON.stringify(input.operations ?? []),
 *       exclusionsJson: JSON.stringify(input.exclusions ?? []),
 *       configurationJson: JSON.stringify(input.configuration ?? {}),
 *     }
 *   );
 * 
 *   return getDatapointConfigurationById(input.id);
 * };
 * 
 * export const getDatapointConfigurationById = async (
 *   id: string
 * ): Promise<UserDatapointConfiguration> => {
 *   await ensureTable();
 * 
 *   const { recordset = [] } = await runQuery<RawDatapointConfigurationRow>(
 *     `SELECT ${SELECT_COLUMNS}
 *      FROM dbo.${TABLE_NAME}
 *      WHERE ID = @id`,
 *     { id }
 *   );
 * 
 *   if (recordset.length === 0) {
 *     throw new Error('Datapoint configuration not found');
 *   }
 * 
 *   return mapRowToConfiguration(recordset[0]);
 * };
 */
