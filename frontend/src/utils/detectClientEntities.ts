import type { ClientEntity, TrialBalanceRow } from '../types';
import type { ParsedUpload } from './parseTrialBalanceWorkbook';
import { slugify } from './slugify';

interface DetectionContext {
  uploads: ParsedUpload[];
  selectedSheetIndexes: number[];
  entities: ClientEntity[];
  combinedRows?: TrialBalanceRow[];
  fileName?: string;
}

interface ScoredEntity {
  id: string;
  score: number;
}

const normalize = (value: string | undefined | null): string => {
  if (!value) return '';
  const slug = slugify(value);
  if (slug && slug.length > 0) {
    return slug;
  }
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
};

const containsNormalized = (haystack: string | undefined, needle: string): boolean => {
  if (!haystack || !needle) {
    return false;
  }
  return normalize(haystack).includes(needle);
};

const collectRowEntityCounts = (
  rows: TrialBalanceRow[] | undefined,
  aliasLookup: Map<string, string>,
): Map<string, number> => {
  const counts = new Map<string, number>();
  if (!rows) return counts;

  rows.forEach((row) => {
    const normalized = normalize(row.entity);
    const matchedId = normalized.length > 0 ? aliasLookup.get(normalized) : undefined;
    if (!matchedId) {
      return;
    }
    counts.set(matchedId, (counts.get(matchedId) ?? 0) + 1);
  });

  return counts;
};

export const detectLikelyEntities = ({
  uploads,
  selectedSheetIndexes,
  entities,
  combinedRows,
  fileName,
}: DetectionContext): string[] => {
  if (entities.length === 0) {
    return [];
  }

  const selectedUploads =
    selectedSheetIndexes.length > 0
      ? selectedSheetIndexes.map((index) => uploads[index]).filter(Boolean)
      : uploads;

  const aliasLookup = new Map<string, string>();
  entities.forEach((entity) => {
    const variants = new Set([
      entity.name,
      entity.displayName,
      entity.entityName,
      ...entity.aliases,
    ]);
    variants.forEach((variant) => {
      const normalized = normalize(variant);
      if (normalized.length > 0) {
        aliasLookup.set(normalized, entity.id);
      }
    });
  });

  const rowEntityCounts = collectRowEntityCounts(combinedRows, aliasLookup);
  const normalizedFileName = normalize(fileName);

  const scores: ScoredEntity[] = entities.map((entity) => {
    const normalizedName = normalize(entity.displayName ?? entity.name);
    const aliasVariants = Array.from(
      new Set([entity.name, entity.displayName, entity.entityName, ...entity.aliases])
    )
      .map(normalize)
      .filter(Boolean);
    const candidates = [normalizedName, ...aliasVariants];
    let score = 0;

    if (normalizedFileName && candidates.some((candidate) => normalizedFileName.includes(candidate))) {
      score += 1;
    }

    selectedUploads.forEach((upload) => {
      const sheetNameMatch = candidates.some((candidate) =>
        containsNormalized(upload.sheetName, candidate),
      );
      if (sheetNameMatch) {
        score += 2;
      }

      const metadataValues = [
        upload.metadata?.entity,
        upload.metadata?.reportName,
        upload.metadata?.sheetNameDate,
      ];
      const metadataMatch = candidates.some((candidate) =>
        metadataValues.some((value) => containsNormalized(value, candidate)),
      );
      if (metadataMatch) {
        score += 3;
      }

      const headerMatch = candidates.some((candidate) =>
        (upload.headers ?? []).some((header) => containsNormalized(header, candidate)),
      );
      if (headerMatch) {
        score += 1;
      }
    });

    const rowMatches = rowEntityCounts.get(entity.id) ?? 0;
    if (rowMatches > 0) {
      score += rowMatches * 2;
    }

    return { id: entity.id, score };
  });

  const maxScore = Math.max(...scores.map((entry) => entry.score));
  if (maxScore <= 0) {
    return entities.length === 1 ? [entities[0].id] : [];
  }

  return scores
    .filter((entry) => entry.score === maxScore && entry.score > 0)
    .map((entry) => entry.id);
};

export default detectLikelyEntities;
