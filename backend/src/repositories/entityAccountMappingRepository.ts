import crypto from 'node:crypto';
import { runQuery } from '../utils/sqlClient';

export interface EntityAccountMappingUpsertInput {
  entityId: string;
  entityAccountId: string;
  polarity?: string | null;
  mappingType?: string | null;
  presetId?: string | null;
  mappingStatus?: string | null;
  exclusionPct?: number | null;
  updatedBy?: string | null;
}

export interface EntityAccountMappingRow extends EntityAccountMappingUpsertInput {
  insertedDttm?: string | null;
  updatedDttm?: string | null;
}

export interface EntityAccountMappingWithRecord extends EntityAccountMappingRow {
  fileUploadGuid?: string | null;
  recordId?: number | null;
  accountName?: string | null;
  activityAmount?: number | null;
  glMonth?: string | null;
}

const TABLE_NAME = 'ml.ENTITY_ACCOUNT_MAPPING';

const normalizeText = (value?: string | null): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeNumber = (value?: number | null): number | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizePresetId = (value?: string | null): string | null => {
  const normalized = normalizeText(value);
  if (normalized) {
    return normalized;
  }
  return null;
};

const requiresPreset = (mappingType?: string | null): boolean => {
  if (!mappingType) {
    return false;
  }

  const normalized = mappingType.trim().toLowerCase();
  return normalized === 'percentage' || normalized === 'dynamic';
};

const mapRow = (row: {
  entity_id: string | null;
  entity_account_id: string;
  polarity?: string | null;
  mapping_type?: string | null;
  preset_id?: string | null;
  mapping_status?: string | null;
  exclusion_pct?: number | null;
  inserted_dttm?: Date | string | null;
  updated_dttm?: Date | string | null;
  updated_by?: string | null;
}): EntityAccountMappingRow => ({
  entityId: row.entity_id?.trim() ?? '',
  entityAccountId: row.entity_account_id,
  polarity: row.polarity ?? null,
  mappingType: row.mapping_type ?? null,
  presetId: row.preset_id ?? null,
  mappingStatus: row.mapping_status ?? null,
  exclusionPct: row.exclusion_pct ?? null,
  insertedDttm:
    row.inserted_dttm instanceof Date
      ? row.inserted_dttm.toISOString()
      : row.inserted_dttm ?? null,
  updatedDttm:
    row.updated_dttm instanceof Date
      ? row.updated_dttm.toISOString()
      : row.updated_dttm ?? null,
  updatedBy: row.updated_by ?? null,
});

export const listEntityAccountMappings = async (
  entityId: string | undefined,
): Promise<EntityAccountMappingRow[]> => {
  if (!entityId) {
    return [];
  }

  const result = await runQuery<{
    entity_id: string;
    entity_account_id: string;
    polarity?: string | null;
    mapping_type?: string | null;
    preset_id?: string | null;
    mapping_status?: string | null;
    exclusion_pct?: number | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `SELECT
      ENTITY_ID as entity_id,
      ENTITY_ACCOUNT_ID as entity_account_id,
      POLARITY as polarity,
      MAPPING_TYPE as mapping_type,
      PRESET_GUID as preset_id,
      MAPPING_STATUS as mapping_status,
      EXCLUSION_PCT as exclusion_pct,
      INSERTED_DTTM as inserted_dttm,
      UPDATED_DTTM as updated_dttm,
      UPDATED_BY as updated_by
    FROM ${TABLE_NAME}
    WHERE ENTITY_ID = @entityId
    ORDER BY ENTITY_ACCOUNT_ID ASC`,
    { entityId }
  );

  return (result.recordset ?? []).map(mapRow);
};

export const listEntityAccountMappingsByFileUpload = async (
  fileUploadGuid: string,
): Promise<EntityAccountMappingWithRecord[]> => {
  if (!fileUploadGuid) {
    return [];
  }

  const result = await runQuery<{
    file_upload_guid: string;
    record_id: number;
    entity_id: string | null;
    entity_account_id: string;
    account_name: string | null;
    activity_amount: number | null;
    gl_month: string | null;
    polarity?: string | null;
    mapping_type?: string | null;
    preset_id?: string | null;
    mapping_status?: string | null;
    exclusion_pct?: number | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `SELECT
      fr.FILE_UPLOAD_GUID as file_upload_guid,
      fr.RECORD_ID as record_id,
      fr.ENTITY_ID as entity_id,
      fr.ACCOUNT_ID as entity_account_id,
      fr.ACCOUNT_NAME as account_name,
      fr.ACTIVITY_AMOUNT as activity_amount,
      fr.GL_MONTH as gl_month,
      eam.POLARITY as polarity,
      eam.MAPPING_TYPE as mapping_type,
      eam.PRESET_GUID as preset_id,
      eam.MAPPING_STATUS as mapping_status,
      eam.EXCLUSION_PCT as exclusion_pct,
      eam.INSERTED_DTTM as inserted_dttm,
      eam.UPDATED_DTTM as updated_dttm,
      eam.UPDATED_BY as updated_by
    FROM ml.FILE_RECORDS fr
    LEFT JOIN ${TABLE_NAME} eam
      ON eam.ENTITY_ID = fr.ENTITY_ID AND eam.ENTITY_ACCOUNT_ID = fr.ACCOUNT_ID
    WHERE fr.FILE_UPLOAD_GUID = @fileUploadGuid
    ORDER BY fr.SOURCE_SHEET_NAME ASC, fr.RECORD_ID ASC`,
    { fileUploadGuid }
  );

  return (result.recordset ?? []).map((row) => ({
    ...mapRow(row),
    fileUploadGuid: row.file_upload_guid,
    recordId: row.record_id,
    accountName: row.account_name,
    activityAmount: row.activity_amount,
    glMonth: row.gl_month,
  }));
};

export const upsertEntityAccountMappings = async (
  inputs: EntityAccountMappingUpsertInput[],
): Promise<EntityAccountMappingRow[]> => {
  if (!inputs.length) {
    return [];
  }

  const params: Record<string, unknown> = {};
  const valuesClause = inputs
    .map((input, index) => {
      const presetId =
        normalizePresetId(input.presetId) ??
        (requiresPreset(input.mappingType) ? crypto.randomUUID() : null);

      params[`entityId${index}`] = input.entityId;
      params[`entityAccountId${index}`] = input.entityAccountId;
      params[`polarity${index}`] = normalizeText(input.polarity);
      params[`mappingType${index}`] = normalizeText(input.mappingType);
      params[`presetId${index}`] = presetId;
      params[`mappingStatus${index}`] = normalizeText(input.mappingStatus);
      params[`exclusionPct${index}`] = normalizeNumber(input.exclusionPct);
      params[`updatedBy${index}`] = normalizeText(input.updatedBy);

      return `(@entityId${index}, @entityAccountId${index}, @polarity${index}, @mappingType${index}, @presetId${index}, @mappingStatus${index}, @exclusionPct${index}, @updatedBy${index})`;
    })
    .join(', ');

  const result = await runQuery<{
    entity_id: string;
    entity_account_id: string;
    polarity?: string | null;
    mapping_type?: string | null;
    preset_id?: string | null;
    mapping_status?: string | null;
    exclusion_pct?: number | null;
    inserted_dttm?: Date | string | null;
    updated_dttm?: Date | string | null;
    updated_by?: string | null;
  }>(
    `MERGE ${TABLE_NAME} AS target
    USING (VALUES ${valuesClause}) AS source(
      entity_id,
      entity_account_id,
      polarity,
      mapping_type,
      preset_id,
      mapping_status,
      exclusion_pct,
      updated_by
    )
    ON target.ENTITY_ID = source.entity_id AND target.ENTITY_ACCOUNT_ID = source.entity_account_id
    WHEN MATCHED THEN
      UPDATE SET
        POLARITY = ISNULL(source.polarity, target.POLARITY),
        MAPPING_TYPE = ISNULL(source.mapping_type, target.MAPPING_TYPE),
        PRESET_GUID = ISNULL(source.preset_id, target.PRESET_GUID),
        MAPPING_STATUS = ISNULL(source.mapping_status, target.MAPPING_STATUS),
        EXCLUSION_PCT = ISNULL(source.exclusion_pct, target.EXCLUSION_PCT),
        UPDATED_BY = source.updated_by,
        UPDATED_DTTM = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
      INSERT (
        ENTITY_ID,
        ENTITY_ACCOUNT_ID,
        POLARITY,
        MAPPING_TYPE,
        PRESET_GUID,
        MAPPING_STATUS,
        EXCLUSION_PCT,
        UPDATED_DTTM,
        UPDATED_BY
      ) VALUES (
        source.entity_id,
        source.entity_account_id,
        source.polarity,
        source.mapping_type,
        source.preset_id,
        source.mapping_status,
        source.exclusion_pct,
        NULL,
        source.updated_by
      )
    OUTPUT
      inserted.ENTITY_ID as entity_id,
      inserted.ENTITY_ACCOUNT_ID as entity_account_id,
      inserted.POLARITY as polarity,
      inserted.MAPPING_TYPE as mapping_type,
      inserted.PRESET_GUID as preset_id,
      inserted.MAPPING_STATUS as mapping_status,
      inserted.EXCLUSION_PCT as exclusion_pct,
      inserted.INSERTED_DTTM as inserted_dttm,
      inserted.UPDATED_DTTM as updated_dttm,
      inserted.UPDATED_BY as updated_by;`,
    params
  );

  return (result.recordset ?? []).map(mapRow);
};

export default listEntityAccountMappings;
