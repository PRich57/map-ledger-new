import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Upload, X, Download } from 'lucide-react';
import Select from '../ui/Select';
import { useClientEntityStore } from '../../store/clientEntityStore';
import { useClientStore } from '../../store/clientStore';
import {
  parseTrialBalanceWorkbook,
  ParsedUpload,
  ParsedRow,
} from '../../utils/parseTrialBalanceWorkbook';
import parseCurrencyValue from '../../utils/parseCurrencyValue';
import ColumnMatcher from './ColumnMatcher';
import {
  fetchClientHeaderMappings,
  saveClientHeaderMappings,
} from '../../utils/clientHeaderMappings';
import type { ClientHeaderMapping } from '../../utils/clientHeaderMappings';
import PreviewTable from './PreviewTable';
import type { ClientEntity, ImportSheet, TrialBalanceRow } from '../../types';
import { normalizeGlMonth, isValidNormalizedMonth } from '../../utils/extractDateFromText';
import { detectLikelyEntities } from '../../utils/detectClientEntities';
import { useAuthStore } from '../../store/authStore';
import { slugify } from '../../utils/slugify';
import MultiSelect from '../ui/MultiSelect';

const templateHeaders = [
  'GL ID',
  'Account Description',
  'Net Change',
  'Entity',
  'User Defined 1',
  'User Defined 2',
  'User Defined 3',
];

type SavedHeaderMapping = {
  sourceHeader: string;
  mappingMethod: string;
};

type EntityAssignment = {
  slot: number;
  entityId: string;
  name: string;
  isCustom: boolean;
};

type EntitySlotSummary = {
  slot: number;
  glMonths: string[];
  accountIds: string[];
  rowCount: number;
};

type DetectedEntityOption = ClientEntity & { detectedCount: number };

const normalizeMonthKey = (glMonth?: string): string => {
  return normalizeGlMonth(glMonth ?? '') || 'unspecified';
};

const ACCOUNT_PREFIX_PATTERN = /^(\d{2,3})[-_.\s]+(.+)$/;
const PREFIX_COVERAGE_THRESHOLD = 0.6;
const IGNORED_ACCOUNT_ID_PATTERNS = [
  /^account\s*(id|number)?$/i,
  /^gl\s*id$/i,
  /\btrial\s+balance\b/i,
];
const MAX_DETECTED_ACCOUNTS = 50;

const shouldSkipAccountId = (value: string): boolean => {
  const normalized = value
    .trim()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ');
  if (!normalized) {
    return true;
  }

  return IGNORED_ACCOUNT_ID_PATTERNS.some((pattern) => pattern.test(normalized));
};

const extractAccountPrefix = (
  value: string,
): { prefix: string; suffix: string } | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(ACCOUNT_PREFIX_PATTERN);
  if (!match) {
    return null;
  }

  const prefix = match[1];
  const suffix = match[2]?.trim() ?? '';

  if (!suffix) {
    return null;
  }

  return { prefix, suffix };
};

const extractRowGlMonth = (row: ParsedRow | TrialBalanceRow): string => {
  const normalizeCandidate = (value: unknown): string => {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return '';
    }

    const normalized = normalizeGlMonth(value.toString());
    return isValidNormalizedMonth(normalized) ? normalized : '';
  };

  const normalizedEntries = Object.entries(row);

  const keyMatches = [
    (key: string) => key.includes('glmonth'),
    (key: string) => key.includes('period'),
    (key: string) => key.endsWith('month') || key === 'month',
  ];

  for (const matcher of keyMatches) {
    for (const [key, value] of normalizedEntries) {
      if (key === 'glMonth') continue;
      const normalizedKey = key.replace(/[\s_-]/g, '').toLowerCase();
      if (!matcher(normalizedKey)) continue;

      const normalizedValue = normalizeCandidate(value);
      if (normalizedValue) {
        return normalizedValue;
      }
    }
  }

  return normalizeCandidate('glMonth' in row ? row.glMonth : undefined);
};

const extractGlMonthsFromRows = (rows: TrialBalanceRow[]): string[] => {
  const monthsSet = new Set<string>();

  rows.forEach((row) => {
    const detectedMonth = extractRowGlMonth(row);
    if (detectedMonth && isValidNormalizedMonth(detectedMonth)) {
      monthsSet.add(detectedMonth);
    }
  });

  return Array.from(monthsSet).sort();
};

const buildSlotSummaries = (
  rows: TrialBalanceRow[],
  rowSlots: number[],
  requiredEntities: number,
): EntitySlotSummary[] =>
  Array.from({ length: requiredEntities }, (_, idx) => {
    const slot = idx + 1;
    const slotRows = rows
      .map((row, rowIdx) => ({ row, slotIndex: rowSlots[rowIdx] }))
      .filter(({ slotIndex }) => slotIndex === slot)
      .map(({ row }) => row);

    const glMonths = new Set<string>();
    const accountIds = new Set<string>();

    slotRows.forEach((row) => {
      glMonths.add(normalizeMonthKey(row.glMonth));
      accountIds.add((row.accountId ?? '').toString().trim() || 'unknown-account');
    });

    return {
      slot,
      glMonths: Array.from(glMonths),
      accountIds: Array.from(accountIds),
      rowCount: slotRows.length,
    } satisfies EntitySlotSummary;
  });

const inferEntitySlotsFromDuplicateAccounts = (
  rows: TrialBalanceRow[],
): { requiredEntities: number; rowSlots: number[] } => {
  const perAccountMonthCounts = new Map<string, number>();
  const rowSlots: number[] = [];

  rows.forEach((row) => {
    const glMonth = normalizeMonthKey(row.glMonth);
    const accountId = (row.accountId ?? '').toString().trim() || 'unknown-account';
    const key = `${glMonth}__${accountId}`;
    const nextCount = (perAccountMonthCounts.get(key) ?? 0) + 1;
    perAccountMonthCounts.set(key, nextCount);
    rowSlots.push(nextCount);
  });

  const requiredEntities = Math.max(...perAccountMonthCounts.values());
  return { requiredEntities, rowSlots };
};

type PrefixRowInfo = { prefix: string; suffix: string; monthKey: string };

const inferEntitySlotsFromAccountPrefixes = (
  rows: TrialBalanceRow[],
): { requiredEntities: number; rowSlots: number[] } | null => {
  if (rows.length === 0) {
    return null;
  }

  const rowPrefixInfo = rows.map((row) => {
    const accountId = (row.accountId ?? '').toString().trim();
    if (!accountId) {
      return null;
    }

    const parsed = extractAccountPrefix(accountId);
    if (!parsed) {
      return null;
    }

    return {
      prefix: parsed.prefix,
      suffix: parsed.suffix,
      monthKey: normalizeMonthKey(row.glMonth),
    } satisfies PrefixRowInfo;
  });

  const parsedRows = rowPrefixInfo.filter((entry): entry is PrefixRowInfo => entry !== null);
  if (parsedRows.length === 0) {
    return null;
  }

  const coverage = parsedRows.length / rows.length;
  if (coverage < PREFIX_COVERAGE_THRESHOLD) {
    return null;
  }

  const prefixes = new Set(parsedRows.map((entry) => entry.prefix));
  if (prefixes.size < 2) {
    return null;
  }

  const suffixMonthPrefixes = new Map<string, Set<string>>();
  parsedRows.forEach((entry) => {
    const suffixKey = entry.suffix.toLowerCase();
    const key = `${entry.monthKey}__${suffixKey}`;
    const set = suffixMonthPrefixes.get(key) ?? new Set<string>();
    set.add(entry.prefix);
    suffixMonthPrefixes.set(key, set);
  });

  const maxPrefixesPerKey = Math.max(
    ...Array.from(suffixMonthPrefixes.values()).map((set) => set.size),
  );
  if (maxPrefixesPerKey < 2) {
    return null;
  }

  const orderedPrefixes = Array.from(prefixes).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  const prefixToSlot = new Map<string, number>(
    orderedPrefixes.map((prefix, index) => [prefix, index + 1]),
  );

  const rowSlots = rowPrefixInfo.map((entry) =>
    entry ? prefixToSlot.get(entry.prefix) ?? 1 : 1,
  );

  return { requiredEntities: orderedPrefixes.length, rowSlots };
};

const inferEntitySlotsFromRows = (
  rows: TrialBalanceRow[],
): {
  requiredEntities: number;
  rowSlots: number[];
  slotSummaries: EntitySlotSummary[];
} => {
  if (rows.length === 0) {
    return { requiredEntities: 0, rowSlots: [], slotSummaries: [] };
  }

  const duplicateResult = inferEntitySlotsFromDuplicateAccounts(rows);
  const prefixResult = inferEntitySlotsFromAccountPrefixes(rows);
  const resolved = prefixResult ?? duplicateResult;

  return {
    requiredEntities: resolved.requiredEntities,
    rowSlots: resolved.rowSlots,
    slotSummaries: buildSlotSummaries(rows, resolved.rowSlots, resolved.requiredEntities),
  };
};

const ensureAssignmentCount = (
  count: number,
  assignments: EntityAssignment[],
): EntityAssignment[] => {
  const normalizedCount = Math.max(0, count);
  const next = assignments.slice(0, normalizedCount).map((assignment, idx) => ({
    ...assignment,
    slot: idx + 1,
  }));

  while (next.length < normalizedCount) {
    next.push({
      slot: next.length + 1,
      entityId: '',
      name: '',
      isCustom: true,
    });
  }

  return next;
};

const prepareEntityAssignments = (
  requiredCount: number,
  availableEntities: ClientEntity[],
  assignments: EntityAssignment[],
): EntityAssignment[] => {
  const base = ensureAssignmentCount(requiredCount, assignments);
  if (requiredCount === 0) {
    return base;
  }

  const unusedEntities = availableEntities.filter(
    (entity) => !base.some((assignment) => assignment.entityId === entity.id),
  );

  return base.map((assignment, idx) => {
    if (assignment.entityId && assignment.name) {
      return assignment;
    }

    const candidate = unusedEntities[idx];
    if (!candidate) {
      return assignment;
    }

    return {
      ...assignment,
      entityId: candidate.id,
      name: candidate.displayName ?? candidate.name,
      isCustom: false,
    };
  });
};

const normalizeEntityLabel = (entity: ClientEntity | null): string => {
  if (!entity) {
    return '';
  }
  return entity.displayName ?? entity.name;
};

const formatDetectedAccountSummary = (accountIds?: string[]): string => {
  if (!accountIds || accountIds.length === 0) {
    return 'Multiple accounts';
  }

  const visibleAccounts = accountIds.slice(0, MAX_DETECTED_ACCOUNTS);
  const hasMoreAccounts = accountIds.length > visibleAccounts.length;
  const summary = visibleAccounts.join(', ');

  return hasMoreAccounts ? `${summary}, ...` : summary;
};

const filterRowsByGlMonth = (
  rows: TrialBalanceRow[],
  glMonth: string,
): TrialBalanceRow[] => {
  const normalizedTarget = normalizeGlMonth(glMonth);
  return rows
    .map((row) => {
      const detectedMonth = extractRowGlMonth(row);
      if (detectedMonth && detectedMonth !== row.glMonth) {
        return { ...row, glMonth: detectedMonth };
      }
      return row;
    })
    .filter((row) => {
      if (!normalizedTarget) {
        return true;
      }
      const normalizedRowMonth = normalizeGlMonth(row.glMonth ?? '');
      return normalizedRowMonth === normalizedTarget;
    });
};

const normalizeEntityValue = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    const normalized = value.toString().trim();
    return normalized.length > 0 ? normalized : '';
  }
  return '';
};

const normalizeEntityMatchKey = (value?: string | null): string => {
  const slug = slugify(value ?? '');
  if (slug) {
    return slug;
  }
  return (value ?? '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
};

const extractEntitiesFromRows = (rows: TrialBalanceRow[]): DetectedEntityOption[] => {
  const detected = new Map<
    string,
    { entity: DetectedEntityOption; aliases: Set<string> }
  >();

  rows.forEach((row) => {
    const providedId = normalizeEntityValue(row.entityId);
    const providedName =
      normalizeEntityValue(row.entityName) || normalizeEntityValue(row.entity);

    if (!providedId && !providedName) {
      return;
    }

    const name = providedName || providedId;
    const id = providedId || slugify(name) || name;
    const key = id.toLowerCase();
    const existing = detected.get(key);
    const aliasSet = existing?.aliases ?? new Set<string>();
    [providedId, providedName, name].forEach((alias) => {
      if (alias) {
        aliasSet.add(alias);
      }
    });

    if (existing) {
      existing.entity.detectedCount += 1;
      existing.aliases = aliasSet;
      return;
    }

    detected.set(key, {
      entity: {
        id,
        name,
        displayName: name,
        aliases: Array.from(aliasSet),
        detectedCount: 1,
      },
      aliases: aliasSet,
    });
  });

  return Array.from(detected.values())
    .map(({ entity, aliases }) => ({
      ...entity,
      aliases: Array.from(aliases),
    }))
    .sort((a, b) => {
      if (a.detectedCount !== b.detectedCount) {
        return b.detectedCount - a.detectedCount;
      }
      const aLabel = a.displayName ?? a.name ?? a.id;
      const bLabel = b.displayName ?? b.name ?? b.id;
      return aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base' });
    });
};

const buildEntitySlotsFromColumn = (
  rows: TrialBalanceRow[],
  detectedEntities: DetectedEntityOption[],
): { requiredEntities: number; rowSlots: number[]; slotSummaries: EntitySlotSummary[] } | null => {
  if (detectedEntities.length === 0) {
    return null;
  }

  const slotLookup = new Map<string, number>();
  detectedEntities.forEach((entity, index) => {
    const slot = index + 1;
    const candidates = [entity.id, entity.name, entity.displayName, ...(entity.aliases ?? [])];
    candidates.forEach((candidate) => {
      const key = normalizeEntityMatchKey(candidate);
      if (key && !slotLookup.has(key)) {
        slotLookup.set(key, slot);
      }
    });
  });

  const rowSlots = rows.map((row) => {
    const rawValue =
      normalizeEntityValue(row.entityId) ||
      normalizeEntityValue(row.entityName) ||
      normalizeEntityValue(row.entity);
    const key = normalizeEntityMatchKey(rawValue);
    return key ? slotLookup.get(key) ?? 1 : 1;
  });

  return {
    requiredEntities: detectedEntities.length,
    rowSlots,
    slotSummaries: buildSlotSummaries(rows, rowSlots, detectedEntities.length),
  };
};

const buildEntityMatchLookup = (entities: ClientEntity[]): Map<string, ClientEntity> => {
  const lookup = new Map<string, ClientEntity>();
  entities.forEach((entity) => {
    const variants = new Set([
      entity.id,
      entity.name,
      entity.displayName,
      entity.entityName,
      ...(entity.aliases ?? []),
    ]);
    variants.forEach((variant) => {
      const key = normalizeEntityMatchKey(variant);
      if (key && !lookup.has(key)) {
        lookup.set(key, entity);
      }
    });
  });
  return lookup;
};

const buildAssignmentsFromDetectedEntities = (
  detectedEntities: DetectedEntityOption[],
  availableEntities: ClientEntity[],
): EntityAssignment[] => {
  const matchLookup = buildEntityMatchLookup(availableEntities);

  return detectedEntities.map((entity, index) => {
    const slot = index + 1;
    const candidates = [entity.id, entity.name, entity.displayName, ...(entity.aliases ?? [])];
    const matched = candidates.reduce<ClientEntity | null>((found, candidate) => {
      if (found) {
        return found;
      }
      const key = normalizeEntityMatchKey(candidate);
      return key ? matchLookup.get(key) ?? null : null;
    }, null);

    if (matched) {
      return {
        slot,
        entityId: matched.id,
        name: normalizeEntityLabel(matched),
        isCustom: false,
      };
    }

    const fallbackName = entity.displayName ?? entity.name ?? entity.id;
    const fallbackId = entity.id || slugify(fallbackName) || `custom-entity-${slot}`;

    return {
      slot,
      entityId: fallbackId,
      name: fallbackName,
      isCustom: true,
    };
  });
};

interface ImportFormProps {
  onImport: (
    uploads: TrialBalanceRow[],
    clientId: string,
    entitySelections: ClientEntity[],
    headerMap: Record<string, string | null>,
    glMonths: string[],
    fileName: string,
    file: File,
    sheetSelections: ImportSheet[],
    selectedSheetUploads: ParsedUpload[],
  ) => void | Promise<void>;
  isImporting: boolean;
}

export default function ImportForm({ onImport, isImporting }: ImportFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLoadingClients = useClientStore((state) => state.isLoading);
  const clients = useClientStore((state) => state.clients);
  const activeClientId = useClientStore((state) => state.activeClientId);
  const fetchClientEntities = useClientEntityStore((state) => state.fetchForClient);
  const entityStoreError = useClientEntityStore((state) => state.error);
  const isLoadingEntities = useClientEntityStore((state) => state.isLoading);
  const entitiesByClient = useClientEntityStore((state) => state.entitiesByClient);
  const userEmail = useAuthStore((state) => state.user?.email ?? null);
  const clientId = activeClientId ?? '';
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploads, setUploads] = useState<ParsedUpload[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<number[]>([]);
  const [headerMap, setHeaderMap] = useState<Record<
    string,
    string | null
  > | null>(null);
  const [entityAssignments, setEntityAssignments] = useState<EntityAssignment[]>([]);
  const [entitySlotSummaries, setEntitySlotSummaries] = useState<EntitySlotSummary[]>([]);
  const [requiredEntityCount, setRequiredEntityCount] = useState(0);
  const [rowEntitySlots, setRowEntitySlots] = useState<number[]>([]);
  const [savedHeaderMappings, setSavedHeaderMappings] = useState<
    Record<string, SavedHeaderMapping>
  >({});
  const [isLoadingHeaderMappings, setIsLoadingHeaderMappings] = useState(false);
  const [headerMappingError, setHeaderMappingError] = useState<string | null>(null);
  const [combinedRows, setCombinedRows] = useState<TrialBalanceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasManualEntitySelection, setHasManualEntitySelection] = useState(false);

  const toHeaderMappingRecord = useCallback(
    (items: ClientHeaderMapping[]): Record<string, SavedHeaderMapping> =>
      items.reduce((acc, mapping) => {
        if (templateHeaders.includes(mapping.templateHeader) && mapping.sourceHeader) {
          acc[mapping.templateHeader] = {
            sourceHeader: mapping.sourceHeader,
            mappingMethod: mapping.mappingMethod,
          };
        }
        return acc;
      }, {} as Record<string, SavedHeaderMapping>),
    []
  );

  const savedHeaderAssignments = useMemo(
    () =>
      Object.entries(savedHeaderMappings).reduce<Record<string, string>>(
        (acc, [template, mapping]) => ({
          ...acc,
          [template]: mapping.sourceHeader,
        }),
        {}
      ),
    [savedHeaderMappings]
  );

  const previewSampleRows = useMemo(() => {
    if (uploads.length === 0 || selectedSheets.length === 0) return [] as Record<string, unknown>[];
    const sheetRows = uploads[selectedSheets[0]]?.rows ?? [];
    return sheetRows.slice(0, 20);
  }, [uploads, selectedSheets]);

  const previewSampleCount = previewSampleRows.length;

  const previewSummaryMessage = useMemo(() => {
    if (uploads.length === 0 || selectedSheets.length === 0) return null;

    if (selectedSheets.length === 1) {
      const totalRows = uploads[selectedSheets[0]]?.rows.length ?? 0;
      if (totalRows === 0) {
        return 'No rows detected in this sheet. Check that the header row and data are present.';
      }

      if (totalRows > previewSampleCount) {
        return `Showing the first ${previewSampleCount.toLocaleString()} of ${totalRows.toLocaleString()} rows to help match your headers.`;
      }

      return `Showing all ${totalRows.toLocaleString()} rows from the uploaded sheet.`;
    }

    const totalRows = selectedSheets.reduce((sum, idx) => {
      return sum + (uploads[idx]?.rows.length ?? 0);
    }, 0);
    return `Previewing first sheet. ${selectedSheets.length} sheets selected with ${totalRows.toLocaleString()} total rows.`;
  }, [uploads, selectedSheets, previewSampleCount]);

  const clientEntityOptions = useMemo(() => {
    if (!clientId) return [];
    return entitiesByClient[clientId] ?? [];
  }, [clientId, entitiesByClient]);

  const detectedEntityOptions = useMemo(
    () => (headerMap?.['Entity'] ? extractEntitiesFromRows(combinedRows) : []),
    [combinedRows, headerMap],
  );
  const detectedEntityCount = detectedEntityOptions.length;
  const hasEntityColumnValues = Boolean(headerMap?.['Entity']) && detectedEntityCount > 0;

  const availableEntityOptions = useMemo(() => {
    const merged = new Map<string, { entity: ClientEntity; detectedCount: number }>();

    const upsert = (candidate: ClientEntity, detectedCount = 0) => {
      const normalizedId = candidate.id?.trim();
      if (!normalizedId) {
        return;
      }
      const key = normalizedId.toLowerCase();
      const existing = merged.get(key);
      const aliases = new Set<string>([
        ...(existing?.entity.aliases ?? []),
        ...(candidate.aliases ?? []),
      ]);
      [candidate.name, candidate.displayName, candidate.entityName].forEach((alias) => {
        if (alias) {
          aliases.add(alias);
        }
      });
      const resolvedName = candidate.displayName ?? candidate.name ?? existing?.entity.name ?? normalizedId;
      merged.set(key, {
        detectedCount: Math.max(existing?.detectedCount ?? 0, detectedCount),
        entity: {
          ...candidate,
          id: normalizedId,
          name: resolvedName ?? normalizedId,
          displayName: candidate.displayName ?? resolvedName ?? normalizedId,
          aliases: Array.from(aliases),
        },
      });
    };

    detectedEntityOptions.forEach((entity) => upsert(entity, entity.detectedCount ?? 0));
    clientEntityOptions.forEach((entity) => upsert(entity));

    return Array.from(merged.values())
      .sort((a, b) => {
        if (a.detectedCount !== b.detectedCount) {
          return b.detectedCount - a.detectedCount;
        }
        const aLabel = a.entity.displayName ?? a.entity.name ?? a.entity.id;
        const bLabel = b.entity.displayName ?? b.entity.name ?? b.entity.id;
        return aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base' });
      })
      .map(({ entity }) => entity);
  }, [clientEntityOptions, detectedEntityOptions]);

  const resolvedAssignments = useMemo(
    () => ensureAssignmentCount(requiredEntityCount, entityAssignments),
    [entityAssignments, requiredEntityCount],
  );
  const allowDuplicateAssignments =
    hasEntityColumnValues && requiredEntityCount > detectedEntityCount;

  const assignedEntities = useMemo(() => {
    const seen = new Set<string>();
    return resolvedAssignments.reduce<ClientEntity[]>((acc, assignment) => {
      const trimmedName = assignment.name.trim();
      const trimmedId = assignment.entityId.trim();
      if (!trimmedName || !trimmedId || seen.has(trimmedId)) {
        return acc;
      }

      const knownEntity = availableEntityOptions.find((entity) => entity.id === trimmedId);
      const hydrated: ClientEntity =
        knownEntity ?? {
          id: trimmedId,
          name: trimmedName,
          displayName: trimmedName,
          aliases: [],
        };

      seen.add(hydrated.id);
      acc.push(hydrated);
      return acc;
    }, []);
  }, [availableEntityOptions, resolvedAssignments]);

  const isEntitySelectionComplete = useMemo(() => {
    if (requiredEntityCount === 0) {
      return false;
    }

    if (resolvedAssignments.length !== requiredEntityCount) {
      return false;
    }

    const completedAssignments = resolvedAssignments.filter(
      (assignment) => assignment.name.trim().length > 0 && assignment.entityId.trim().length > 0,
    );

    if (completedAssignments.length !== requiredEntityCount) {
      return false;
    }

    if (allowDuplicateAssignments) {
      return true;
    }

    const uniqueIds = new Set(completedAssignments.map((assignment) => assignment.entityId.trim()));
    return uniqueIds.size === requiredEntityCount;
  }, [allowDuplicateAssignments, requiredEntityCount, resolvedAssignments]);

  const rowsWithEntityAssignments = useMemo(() => {
    if (combinedRows.length === 0) {
      return [] as TrialBalanceRow[];
    }

    return combinedRows.map((row, index) => {
      const slotIndex = rowEntitySlots[index] ?? 1;
      const assignment = resolvedAssignments[slotIndex - 1];
      if (!assignment || assignment.name.trim().length === 0) {
        return row;
      }

      return { ...row, entity: assignment.name.trim(), entitySlot: slotIndex };
    });
  }, [combinedRows, resolvedAssignments, rowEntitySlots]);

  const entityAssignmentNeedsCustom =
    !allowDuplicateAssignments &&
    requiredEntityCount > 0 &&
    availableEntityOptions.length < requiredEntityCount;

  useEffect(() => {
    if (clientId) {
      fetchClientEntities(clientId);
    }
  }, [clientId, fetchClientEntities]);

  useEffect(() => {
    setEntityAssignments([]);
    setEntitySlotSummaries([]);
    setRequiredEntityCount(0);
    setRowEntitySlots([]);
    setHasManualEntitySelection(false);
  }, [clientId]);

  useEffect(() => {
    if (!clientId) {
      setSavedHeaderMappings({});
      return;
    }

    const loadMappings = async () => {
      setIsLoadingHeaderMappings(true);
      setHeaderMappingError(null);
      try {
        const stored = await fetchClientHeaderMappings(clientId);
        setSavedHeaderMappings(toHeaderMappingRecord(stored));
      } catch (err) {
        setHeaderMappingError(
          'Unable to load saved header mappings. You can still continue with manual matching.'
        );
        setSavedHeaderMappings({});
      } finally {
        setIsLoadingHeaderMappings(false);
      }
    };

    void loadMappings();
  }, [clientId, toHeaderMappingRecord]);

  useEffect(() => {
    if (combinedRows.length === 0) {
      setRowEntitySlots([]);
      setEntitySlotSummaries([]);
      setRequiredEntityCount(0);
      setEntityAssignments([]);
      return;
    }

    const inferred = inferEntitySlotsFromRows(combinedRows);
    const normalizedRequired = Math.max(inferred.requiredEntities, 1);

    const columnGrouping = hasEntityColumnValues
      ? buildEntitySlotsFromColumn(combinedRows, detectedEntityOptions)
      : null;

    if (columnGrouping && normalizedRequired <= detectedEntityCount) {
      setRowEntitySlots(columnGrouping.rowSlots);
      setEntitySlotSummaries(columnGrouping.slotSummaries);
      setRequiredEntityCount(columnGrouping.requiredEntities);
    } else {
      setRowEntitySlots(inferred.rowSlots);
      setEntitySlotSummaries(inferred.slotSummaries);
      setRequiredEntityCount(normalizedRequired);
    }
  }, [combinedRows, detectedEntityCount, detectedEntityOptions, hasEntityColumnValues]);

  useEffect(() => {
    if (requiredEntityCount === 0) {
      if (entityAssignments.length > 0) {
        setEntityAssignments([]);
      }
      return;
    }

    const nextAssignments = hasManualEntitySelection
      ? ensureAssignmentCount(requiredEntityCount, entityAssignments)
      : hasEntityColumnValues
        ? ensureAssignmentCount(
            requiredEntityCount,
            buildAssignmentsFromDetectedEntities(
              detectedEntityOptions,
              clientEntityOptions,
            ),
          )
        : prepareEntityAssignments(requiredEntityCount, availableEntityOptions, entityAssignments);

    const hasChanged =
      nextAssignments.length !== entityAssignments.length ||
      nextAssignments.some((assignment, idx) => {
        const current = entityAssignments[idx];
        if (!current) return true;
        return (
          current.slot !== assignment.slot ||
          current.entityId !== assignment.entityId ||
          current.name !== assignment.name ||
          current.isCustom !== assignment.isCustom
        );
      });

    if (hasChanged) {
      setEntityAssignments(nextAssignments);
    }
  }, [
    entityAssignments,
    availableEntityOptions,
    clientEntityOptions,
    detectedEntityOptions,
    hasManualEntitySelection,
    hasEntityColumnValues,
    requiredEntityCount,
  ]);

  useEffect(() => {
    if (
      hasManualEntitySelection ||
      hasEntityColumnValues ||
      availableEntityOptions.length === 0 ||
      uploads.length === 0 ||
      requiredEntityCount === 0
    ) {
      return;
    }

    const detected = detectLikelyEntities({
      uploads,
      selectedSheetIndexes: selectedSheets,
      entities: availableEntityOptions,
      combinedRows,
      fileName: selectedFile?.name,
    }).slice(0, requiredEntityCount);

    if (detected.length === 0) {
      return;
    }

    setEntityAssignments((prev) => {
      const hydrated = prepareEntityAssignments(
        requiredEntityCount,
        availableEntityOptions,
        prev,
      );

      return hydrated.map((assignment, idx) => {
        const detectedId = detected[idx];
        if (!detectedId) {
          return assignment;
        }
        const matched = availableEntityOptions.find((entity) => entity.id === detectedId);
        if (!matched) {
          return assignment;
        }

        return {
          ...assignment,
          entityId: matched.id,
          name: normalizeEntityLabel(matched),
          isCustom: false,
        };
      });
    });
  }, [
    combinedRows,
    availableEntityOptions,
    hasEntityColumnValues,
    hasManualEntitySelection,
    requiredEntityCount,
    selectedFile?.name,
    selectedSheets,
    uploads,
  ]);

  useEffect(() => {
    if (uploads.length > 0 && selectedSheets.length === 0) {
      // Auto-select first sheet when file is uploaded
      setSelectedSheets([0]);
    }
  }, [uploads, selectedSheets.length]);

  const persistHeaderMappings = useCallback(
    async (map: Record<string, string | null>) => {
      if (!clientId) {
        return;
      }

      const normalizedMap = Object.entries(map).reduce<
        Record<string, string>
      >((acc, [template, source]) => {
        if (source) {
          acc[template] = source;
        }
        return acc;
      }, {});

      const hasChanges =
        Object.keys(normalizedMap).length !==
          Object.keys(savedHeaderMappings).length ||
        Object.entries(normalizedMap).some(
          ([template, source]) => savedHeaderMappings[template]?.sourceHeader !== source
        );

      if (!hasChanges) {
        return;
      }

      const payload = Object.entries(map).map(
        ([templateHeader, sourceHeader]) => {
          const normalizedSource = sourceHeader ?? null;
          const previous = savedHeaderMappings[templateHeader];
          const mappingMethod = previous
            ? previous.sourceHeader === normalizedSource
              ? previous.mappingMethod
              : 'manual'
            : 'manual';

          return {
            templateHeader,
            sourceHeader: normalizedSource,
            mappingMethod,
            updatedBy: userEmail,
          };
        }
      );

      const saved = await saveClientHeaderMappings(clientId, payload);
      setSavedHeaderMappings(toHeaderMappingRecord(saved));
      setHeaderMappingError(null);
    },
    [clientId, savedHeaderMappings, toHeaderMappingRecord, userEmail]
  );

  const handleAssignmentSelection = (slot: number, value: string) => {
    setHasManualEntitySelection(true);
    setEntityAssignments((prev) => {
      const normalized = ensureAssignmentCount(
        Math.max(requiredEntityCount, slot),
        prev,
      );

      return normalized.map((assignment) => {
        if (assignment.slot !== slot) {
          return assignment;
        }

        if (!value) {
          return { ...assignment, entityId: '', name: '', isCustom: true };
        }

        if (value === '__custom__') {
          const fallbackId =
            assignment.name.trim().length > 0
              ? slugify(assignment.name)
              : `custom-entity-${slot}`;

          return {
            ...assignment,
            entityId: fallbackId || `custom-entity-${slot}`,
            isCustom: true,
          };
        }

        const matched = availableEntityOptions.find((entity) => entity.id === value) ?? null;
        return {
          slot: assignment.slot,
          entityId: matched?.id ?? value,
          name: normalizeEntityLabel(matched) || value,
          isCustom: !matched,
        };
      });
    });
  };

  const handleCustomEntityNameChange = (slot: number, value: string) => {
    setHasManualEntitySelection(true);
    const trimmed = value.trimStart();
    setEntityAssignments((prev) => {
      const normalized = ensureAssignmentCount(
        Math.max(requiredEntityCount, slot),
        prev,
      );

      return normalized.map((assignment) => {
        if (assignment.slot !== slot) {
          return assignment;
        }

        const normalizedId =
          slugify(trimmed) || assignment.entityId || `custom-entity-${slot}`;
        return {
          ...assignment,
          name: trimmed,
          entityId: normalizedId,
          isCustom: true,
        };
      });
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const processFile = async (file: File) => {
    try {
      if (!clientId) {
        setError('Please select a client before uploading.');
        setSelectedFile(null);
        setSelectedSheets([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const parsed = await parseTrialBalanceWorkbook(file); // Future: pass config to this function
      if (parsed.length === 0)
        throw new Error('No valid data found in any sheet.');

      setUploads(parsed);
      setSelectedSheets([]);  // Will be auto-set by useEffect
      setSelectedFile(file);
      setHeaderMap(null);
      setHeaderMappingError(null);
      setCombinedRows([]);
      setEntityAssignments([]);
      setEntitySlotSummaries([]);
      setRequiredEntityCount(0);
      setRowEntitySlots([]);
      setError(null);
      setHasManualEntitySelection(false);
    } catch (err) {
      setError((err as Error).message);
      setUploads([]);
      setSelectedSheets([]);
      setSelectedFile(null);
      setHeaderMap(null);
      setHeaderMappingError(null);
      setCombinedRows([]);
      setEntityAssignments([]);
      setEntitySlotSummaries([]);
      setRequiredEntityCount(0);
      setRowEntitySlots([]);
    }
  };

  const handleColumnMatch = async (map: Record<string, string | null>) => {
    setHeaderMap(map);

    const keyMap = Object.entries(map).reduce(
      (acc, [dest, src]) => {
        if (src) acc[dest] = src;
        return acc;
      },
      {} as Record<string, string>
    );

    // Map all sheets (we'll filter by selectedSheets later)
    const mappedSheets = uploads.map((sheet) => {
      // Try to get GL month from metadata (cell B4)
      const normalizedSheetMonth = normalizeGlMonth(
        sheet.metadata.glMonth || ''
      );

      // Try to get GL month from sheet name (e.g., "Trial balance report (Aug'24)")
      const sheetNameMonth = sheet.metadata.sheetNameDate || '';

      return sheet.rows
        .map((row) => {
          const accountIdValue = keyMap['GL ID']
            ? row[keyMap['GL ID']]
            : '';
          const descriptionValue = keyMap['Account Description']
            ? row[keyMap['Account Description']]
            : '';

          const accountId =
            accountIdValue !== undefined && accountIdValue !== null
              ? accountIdValue.toString().trim()
              : '';
          const description =
            descriptionValue !== undefined && descriptionValue !== null
              ? descriptionValue.toString().trim()
              : '';

          if (!accountId || !description || shouldSkipAccountId(accountId)) {
            return null;
          }

          const entityValue = keyMap['Entity']
            ? row[keyMap['Entity']]
            : '';
          const netChangeValue = keyMap['Net Change']
            ? row[keyMap['Net Change']]
            : 0;

          const entity =
            entityValue !== undefined && entityValue !== null
              ? entityValue.toString().trim()
              : '';

          // Extract GL month with priority: row data > cell B4 > sheet name
          const detectedRowMonth = extractRowGlMonth(row);
          const effectiveMonth = detectedRowMonth || normalizedSheetMonth || sheetNameMonth;

          return {
            accountId,
            description,
            netChange: parseCurrencyValue(netChangeValue),
            entity,
            ...(effectiveMonth && { glMonth: effectiveMonth }),
            ...row,
          } as TrialBalanceRow;
        })
        .filter((row): row is TrialBalanceRow => row !== null);
    });

    // Combine selected sheets into one dataset
    const combined = selectedSheets.flatMap((sheetIdx) => {
      return mappedSheets[sheetIdx] ?? [];
    });

    setCombinedRows(combined);

    if (clientId) {
      try {
        await persistHeaderMappings(map);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to save header mappings for future imports.';
        setHeaderMappingError(message);
        throw err instanceof Error
          ? err
          : new Error('Failed to save header mappings for future imports.');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      selectedFile &&
      clientId &&
      isEntitySelectionComplete &&
      rowsWithEntityAssignments.length > 0 &&
      headerMap
    ) {
      const glMonths = extractGlMonthsFromRows(rowsWithEntityAssignments);

      const sheetSelections: ImportSheet[] = selectedSheets.map((sheetIdx) => {
        const sheetUpload = uploads[sheetIdx];
        const trimmedGlMonth = sheetUpload.metadata.glMonth?.trim();
        const inferredMonth =
          trimmedGlMonth && trimmedGlMonth.length > 0
            ? trimmedGlMonth
            : sheetUpload.metadata.sheetNameDate || undefined;

        return {
          sheetName: sheetUpload.sheetName,
          glMonth: inferredMonth,
          rowCount: sheetUpload.rows.length,
          isSelected: true,
          firstDataRowIndex: sheetUpload.firstDataRowIndex,
        };
      });

      await onImport(
        rowsWithEntityAssignments,
        clientId,
        assignedEntities,
        headerMap,
        glMonths,
        selectedFile.name,
        selectedFile,
        sheetSelections,
        selectedSheets
          .map((sheetIdx) => uploads[sheetIdx])
          .filter((upload): upload is ParsedUpload => Boolean(upload))
      );
    } else {
      setError(
        'Please complete all steps including column matching and sheet selection.'
      );
    }
  };

  const downloadTemplate = () => {
    const template = `GL_Month_Quarter,GL_Account,GL_Description,Net_Change\n2024-01-01,5000-000,Sample Expense,1000\n2024-01-01,5100-000,Another Expense,2000`;
    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mapledger_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {!isLoadingClients && clients.length === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No clients are currently linked to your account. Please contact an
          administrator to request access.
        </div>
      )}

      {entityStoreError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {entityStoreError}
        </div>
      )}

      <div
        className="mt-2 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="space-y-1 text-center">
          {selectedFile ? (
            <div className="flex items-center justify-center space-x-2">
              <span className="text-sm text-gray-900">{selectedFile.name}</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setUploads([]);
                  setSelectedSheets([]);
                  setHeaderMap(null);
                  setCombinedRows([]);
                  setEntityAssignments([]);
                  setEntitySlotSummaries([]);
                  setRequiredEntityCount(0);
                  setRowEntitySlots([]);
                  setHasManualEntitySelection(false);
                }}
                className="text-gray-500 hover:text-red-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <div className="flex text-sm text-gray-600">
                <label
                  htmlFor="file-upload"
                  className="relative cursor-pointer rounded-md font-medium text-blue-600 hover:text-blue-500"
                >
                  <span>Upload a file</span>
                  <input
                    id="file-upload"
                    ref={fileInputRef}
                    name="file-upload"
                    type="file"
                    accept=".csv, .xlsx"
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-500">
                Excel files with multiple sheets supported
              </p>
            </>
          )}
        </div>
      </div>

      {uploads.length > 1 && (
        <MultiSelect
          label="Sheet Selection"
          options={uploads.map((u, idx) => ({
            value: idx.toString(),
            label: u.sheetName,
          }))}
          value={selectedSheets.map(idx => idx.toString())}
          onChange={(values: string[]) => {
            setSelectedSheets(values.map((v: string) => parseInt(v, 10)));
          }}
        />
      )}

      {uploads.length > 0 && selectedSheets.length > 0 && !headerMap && (
        <div className="space-y-6">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              <ColumnMatcher
                sourceHeaders={uploads[selectedSheets[0]].headers}
                destinationHeaders={templateHeaders}
                initialAssignments={savedHeaderAssignments}
                onComplete={handleColumnMatch}
              />
              {(isLoadingHeaderMappings || headerMappingError) && (
                <p
                  className={`text-sm ${
                    headerMappingError ? 'text-amber-700' : 'text-gray-500'
                  }`}
                >
                  {headerMappingError ?? 'Loading saved header preferences…'}
                </p>
              )}
            </div>

            <div className="flex flex-col">
              <PreviewTable
                className="mt-0"
                rows={previewSampleRows}
                sheetName={uploads[selectedSheets[0]]?.sheetName}
                columnOrder={uploads[selectedSheets[0]]?.headers ?? []}
                emptyStateMessage="Your upload data will appear here once we detect rows in the selected sheet."
              />
              {previewSummaryMessage && (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  {previewSummaryMessage}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {headerMap && combinedRows.length > 0 && (
        <div className="space-y-4">
          {requiredEntityCount > 0 && (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5 dark:border-slate-700 dark:bg-slate-900/80 dark:shadow-none">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Entity assignment</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Account IDs indicate {requiredEntityCount} entity
                    {requiredEntityCount > 1 ? ' groups' : ' group'} before moving on to mapping.
                  </p>
                </div>
                <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-200">
                  Minimum required: {requiredEntityCount}
                </span>
              </div>

              {entityAssignmentNeedsCustom && (
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Fewer than {requiredEntityCount} saved entities were found for this client. Type new entity names to
                  cover every group.
                </p>
              )}

              <div className="space-y-4">
                {resolvedAssignments.map((assignment) => {
                  const summary = entitySlotSummaries.find((slot) => slot.slot === assignment.slot);
                  const glMonthSummary = summary?.glMonths.join(', ') || 'Unspecified month';
                  const accountSummary = formatDetectedAccountSummary(summary?.accountIds);
                  const usedEntityIds = allowDuplicateAssignments
                    ? new Set<string>()
                    : new Set(
                        resolvedAssignments
                          .filter((other) => other.slot !== assignment.slot)
                          .map((other) => other.entityId.trim())
                          .filter(Boolean),
                      );
                  const selectableEntities = allowDuplicateAssignments
                    ? availableEntityOptions
                    : availableEntityOptions.filter((entity) => !usedEntityIds.has(entity.id));

                  return (
                    <div
                      key={assignment.slot}
                      className="space-y-4 rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900/80 dark:shadow-none"
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Entity group {assignment.slot}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-300">
                            Months: {glMonthSummary} | Accounts: {accountSummary}
                          </p>
                        </div>
                        <span className="text-xs font-medium text-slate-400 sm:text-right">
                          {summary?.rowCount ?? 0} rows
                        </span>
                      </div>

                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <Select
                          label="Choose an entity"
                          value={assignment.isCustom ? '__custom__' : assignment.entityId}
                          onChange={(e) => handleAssignmentSelection(assignment.slot, e.target.value)}
                          disabled={!clientId || isLoadingClients || isLoadingEntities}
                          required
                          className="min-w-0"
                          labelClassName="text-slate-800 dark:text-slate-200"
                          selectClassName="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:ring-blue-400/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                        >
                          <option value="">Select an entity</option>
                          {selectableEntities.map((entity) => (
                            <option key={entity.id} value={entity.id}>
                              {normalizeEntityLabel(entity)}
                            </option>
                          ))}
                          <option value="__custom__">Type a new entity</option>
                        </Select>

                        <div className="space-y-1">
                          <label
                            className="block text-sm font-medium text-slate-900 dark:text-slate-100"
                            htmlFor={`custom-entity-${assignment.slot}`}
                          >
                            Entity name
                          </label>
                          <input
                            id={`custom-entity-${assignment.slot}`}
                            type="text"
                            value={assignment.name}
                            onChange={(e) => handleCustomEntityNameChange(assignment.slot, e.target.value)}
                            placeholder="Enter an entity name"
                            className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {!isEntitySelectionComplete && (
                <p className="text-sm text-amber-700">
                  Assign an entity name to every group to enable mapping.
                </p>
              )}
            </div>
          )}

          <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Import Summary</h3>
            <div className="text-sm text-gray-700 space-y-1">
              <p><strong>Total Rows:</strong> {rowsWithEntityAssignments.length.toLocaleString()}</p>
              <p><strong>Sheets:</strong> {selectedSheets.map(idx => uploads[idx]?.sheetName).join(', ')}</p>
              <p><strong>GL Months Detected:</strong> {extractGlMonthsFromRows(rowsWithEntityAssignments).join(', ') || 'None detected'}</p>
            </div>
          </div>
          <PreviewTable
            rows={rowsWithEntityAssignments.slice(0, 20)}
            sheetName="Combined Data"
            columnOrder={uploads[selectedSheets[0]]?.headers ?? []}
          />
        </div>
      )}

      {error && <div className="text-sm text-red-600">{error}</div>}

      {combinedRows.length > 0 && headerMap && (
        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Download className="h-4 w-4 mr-2" />
            Download Template
          </button>

          <button
            type="submit"
            disabled={
              !selectedFile ||
              !clientId ||
              !isEntitySelectionComplete ||
              isImporting ||
              uploads.length === 0 ||
              selectedSheets.length === 0 ||
              !headerMap ||
              rowsWithEntityAssignments.length === 0
            }
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {isImporting ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Import File
              </>
            )}
          </button>
        </div>
      )}
    </form>
  );
}

export {
  normalizeGlMonth,
  extractGlMonthsFromRows,
  extractEntitiesFromRows,
  filterRowsByGlMonth,
  inferEntitySlotsFromRows,
  prepareEntityAssignments,
};
