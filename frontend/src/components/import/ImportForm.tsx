import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Upload, X, Download } from 'lucide-react';
import Select from '../ui/Select';
import { useOrganizationStore } from '../../store/organizationStore';
import { useClientEntityStore } from '../../store/clientEntityStore';
import {
  parseTrialBalanceWorkbook,
  ParsedUpload,
  ParsedRow,
} from '../../utils/parseTrialBalanceWorkbook';
import parseCurrencyValue from '../../utils/parseCurrencyValue';
import ColumnMatcher from './ColumnMatcher';
import {
  getClientTemplateMapping,
  ClientTemplateConfig,
} from '../../utils/getClientTemplateMapping';
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

const normalizeMonthKey = (glMonth?: string): string => {
  return normalizeGlMonth(glMonth ?? '') || 'unspecified';
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
  const slotSummaries: EntitySlotSummary[] = Array.from(
    { length: requiredEntities },
    (_, idx) => {
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
    },
  );

  return { requiredEntities, rowSlots, slotSummaries };
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
  const companies = useOrganizationStore((state) => state.companies);
  const isLoadingClients = useOrganizationStore((state) => state.isLoading);
  const fetchClientEntities = useClientEntityStore((state) => state.fetchForClient);
  const entityStoreError = useClientEntityStore((state) => state.error);
  const isLoadingEntities = useClientEntityStore((state) => state.isLoading);
  const entitiesByClient = useClientEntityStore((state) => state.entitiesByClient);
  const userEmail = useAuthStore((state) => state.user?.email ?? null);
  const [clientId, setClientId] = useState('');
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
    } else {
      const totalRows = selectedSheets.reduce((sum, idx) => {
        return sum + (uploads[idx]?.rows.length ?? 0);
      }, 0);
      return `Previewing first sheet. ${selectedSheets.length} sheets selected with ${totalRows.toLocaleString()} total rows.`;
    }
  }, [uploads, selectedSheets, previewSampleCount]);

  const clientOptions = useMemo(() => {
    const all = companies.flatMap((company) => company.clients);
    return all.filter(
      (c, idx) => all.findIndex((cc) => cc.id === c.id) === idx
    );
  }, [companies]);

  const singleClientId = clientOptions.length === 1 ? clientOptions[0].id : null;

  const entityOptions = useMemo(() => {
    if (!clientId) return [];
    return entitiesByClient[clientId] ?? [];
  }, [clientId, entitiesByClient]);

  const resolvedAssignments = useMemo(
    () => ensureAssignmentCount(requiredEntityCount, entityAssignments),
    [entityAssignments, requiredEntityCount],
  );

  const assignedEntities = useMemo(() => {
    const seen = new Set<string>();
    return resolvedAssignments.reduce<ClientEntity[]>((acc, assignment) => {
      const trimmedName = assignment.name.trim();
      const trimmedId = assignment.entityId.trim();
      if (!trimmedName || !trimmedId || seen.has(trimmedId)) {
        return acc;
      }

      const knownEntity = entityOptions.find((entity) => entity.id === trimmedId);
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
  }, [entityOptions, resolvedAssignments]);

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

    const uniqueIds = new Set(completedAssignments.map((assignment) => assignment.entityId.trim()));
    return uniqueIds.size === requiredEntityCount;
  }, [requiredEntityCount, resolvedAssignments]);

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
    requiredEntityCount > 0 && entityOptions.length < requiredEntityCount;

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
    if (singleClientId) {
      setClientId(singleClientId);
    }
  }, [singleClientId]);

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
    const { requiredEntities, rowSlots, slotSummaries } = inferEntitySlotsFromRows(
      combinedRows,
    );
    const normalizedRequired = combinedRows.length > 0 ? Math.max(requiredEntities, 1) : 0;

    setRowEntitySlots(rowSlots);
    setEntitySlotSummaries(slotSummaries);
    setRequiredEntityCount(normalizedRequired);

    if (combinedRows.length === 0) {
      setEntityAssignments([]);
    }
  }, [combinedRows]);

  useEffect(() => {
    if (requiredEntityCount === 0) {
      if (entityAssignments.length > 0) {
        setEntityAssignments([]);
      }
      return;
    }

    const nextAssignments = hasManualEntitySelection
      ? ensureAssignmentCount(requiredEntityCount, entityAssignments)
      : prepareEntityAssignments(requiredEntityCount, entityOptions, entityAssignments);

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
    entityOptions,
    hasManualEntitySelection,
    requiredEntityCount,
  ]);

  useEffect(() => {
    if (
      hasManualEntitySelection ||
      entityOptions.length === 0 ||
      uploads.length === 0 ||
      requiredEntityCount === 0
    ) {
      return;
    }

    const detected = detectLikelyEntities({
      uploads,
      selectedSheetIndexes: selectedSheets,
      entities: entityOptions,
      combinedRows,
      fileName: selectedFile?.name,
    }).slice(0, requiredEntityCount);

    if (detected.length === 0) {
      return;
    }

    setEntityAssignments((prev) => {
      const hydrated = prepareEntityAssignments(requiredEntityCount, entityOptions, prev);

      return hydrated.map((assignment, idx) => {
        const detectedId = detected[idx];
        if (!detectedId) {
          return assignment;
        }
        const matched = entityOptions.find((entity) => entity.id === detectedId);
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
    entityOptions,
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

        const matched = entityOptions.find((entity) => entity.id === value) ?? null;
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

      const clientConfig: ClientTemplateConfig | null =
        await getClientTemplateMapping(clientId);
      console.log('Fetched client config:', clientConfig);

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

          if (!accountId || !description) {
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
    const template = `GL_Month_Quarter,GL_Account,GL_Description,Net_Change\n2024-01,5000-000,Sample Expense,1000\n2024-01,5100-000,Another Expense,2000`;
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
      {clientOptions.length > 1 && (
        <Select
          label="Client"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          required
          disabled={clientOptions.length === 0 || isLoadingClients}
        >
          <option value="">Select a client</option>
          {clientOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      )}

      {!isLoadingClients && clientOptions.length === 0 && (
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
                  setClientId(singleClientId ?? '');
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
          onChange={(values) => {
            setSelectedSheets(values.map(v => parseInt(v, 10)));
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
            <div className="space-y-4 rounded-md border border-blue-200 bg-blue-50 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-medium text-blue-900">Entity assignment</h3>
                  <p className="text-sm text-blue-800">
                    Duplicate account IDs were found within the same GL month. Assign{' '}
                    {requiredEntityCount} entity
                    {requiredEntityCount > 1 ? ' groups' : ' group'} before moving on to mapping.
                  </p>
                </div>
                <span className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-medium text-blue-800">
                  Minimum required: {requiredEntityCount}
                </span>
              </div>

              {entityAssignmentNeedsCustom && (
                <p className="text-xs text-blue-800">
                  Fewer than {requiredEntityCount} saved entities were found for this client. Type new entity names to
                  cover every group.
                </p>
              )}

              <div className="grid gap-3">
                {resolvedAssignments.map((assignment) => {
                  const summary = entitySlotSummaries.find((slot) => slot.slot === assignment.slot);
                  const glMonthSummary = summary?.glMonths.join(', ') || 'Unspecified month';
                  const accountSummary = summary?.accountIds.join(', ') || 'Multiple accounts';

                  return (
                    <div
                      key={assignment.slot}
                      className="rounded-md border border-blue-200 bg-white p-3 shadow-sm"
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Entity group {assignment.slot}</p>
                          <p className="text-xs text-gray-600">
                            Months: {glMonthSummary} · Accounts: {accountSummary}
                          </p>
                        </div>
                        <span className="text-xs text-gray-500">{summary?.rowCount ?? 0} rows</span>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <Select
                          label="Choose an entity"
                          value={assignment.isCustom ? '__custom__' : assignment.entityId}
                          onChange={(e) => handleAssignmentSelection(assignment.slot, e.target.value)}
                          disabled={!clientId || isLoadingClients || isLoadingEntities}
                          required
                        >
                          <option value="">Select an entity</option>
                          {entityOptions.map((entity) => (
                            <option key={entity.id} value={entity.id}>
                              {normalizeEntityLabel(entity)}
                            </option>
                          ))}
                          <option value="__custom__">Type a new entity</option>
                        </Select>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={`custom-entity-${assignment.slot}`}>
                            Entity name
                          </label>
                          <input
                            id={`custom-entity-${assignment.slot}`}
                            type="text"
                            value={assignment.name}
                            onChange={(e) => handleCustomEntityNameChange(assignment.slot, e.target.value)}
                            placeholder="Enter an entity name"
                            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
  filterRowsByGlMonth,
  inferEntitySlotsFromRows,
  prepareEntityAssignments,
};