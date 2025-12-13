import { normalizeGlMonth } from '../utils/glMonth';
import { runQuery } from '../utils/sqlClient';

export interface ClientGlDataInput {
  operationCd: string;
  glId: string;
  glMonth: string;
  glValue: number;
}

const TABLE_NAME = 'ml.CLIENT_GL_DATA';

const normalizeText = (value?: string | null): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toSqlMonth = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const normalized = normalizeGlMonth(value);
  return normalized || null;
};

const normalizeOperationCode = (value?: string | null): string | null => {
  const normalized = normalizeText(value);
  return normalized ? normalized.toUpperCase() : null;
};

const sanitizeClientGlData = (
  entries: ClientGlDataInput[],
): ClientGlDataInput[] => {
  return entries
    .map(entry => {
      const operationCd = normalizeOperationCode(entry.operationCd);
      const glId = normalizeText(entry.glId);
      const glMonth = toSqlMonth(entry.glMonth);
      const glValue = Number.isFinite(entry.glValue) ? entry.glValue : NaN;
      if (!operationCd || !glId || !glMonth || !Number.isFinite(glValue)) {
        return null;
      }
      return {
        operationCd,
        glId,
        glMonth,
        glValue,
      };
    })
    .filter((entry): entry is ClientGlDataInput => Boolean(entry));
};

const deleteClientGlDataForKeys = async (
  entries: ClientGlDataInput[],
): Promise<void> => {
  const uniqueKeys = new Map<string, ClientGlDataInput>();
  entries.forEach(entry => {
    const key = `${entry.operationCd}|||${entry.glId}`;
    if (!uniqueKeys.has(key)) {
      uniqueKeys.set(key, entry);
    }
  });

  if (!uniqueKeys.size) {
    return;
  }

  const params: Record<string, unknown> = {};
  const clauses = Array.from(uniqueKeys.values())
    .map((entry, index) => {
      params[`operationCdDelete${index}`] = entry.operationCd;
      params[`glIdDelete${index}`] = entry.glId;
      return `(OPERATION_CD = @operationCdDelete${index} AND GL_ID = @glIdDelete${index})`;
    })
    .join(' OR ');

  if (!clauses) {
    return;
  }

  await runQuery(`DELETE FROM ${TABLE_NAME} WHERE ${clauses}`, params);
};

export const replaceClientGlData = async (
  entries: ClientGlDataInput[],
): Promise<void> => {
  const normalized = sanitizeClientGlData(entries);
  if (!normalized.length) {
    return;
  }

  await deleteClientGlDataForKeys(normalized);

  const params: Record<string, unknown> = {};
  const valuesClause = normalized
    .map((entry, index) => {
      params[`operationCd${index}`] = entry.operationCd;
      params[`glId${index}`] = entry.glId;
      params[`glMonth${index}`] = entry.glMonth;
      params[`glValue${index}`] = entry.glValue;
      return `(@operationCd${index}, @glId${index}, @glMonth${index}, @glValue${index})`;
    })
    .join(', ');

  await runQuery(
    `INSERT INTO ${TABLE_NAME} (
      OPERATION_CD,
      GL_ID,
      GL_MONTH,
      GL_VALUE
    )
    VALUES ${valuesClause}`,
    params,
  );
};
