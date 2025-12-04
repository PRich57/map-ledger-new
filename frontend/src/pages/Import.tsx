import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { useImportStore } from '../store/importStore';
import ImportHistory from '../components/import/ImportHistory';
import ImportForm from '../components/import/ImportForm';
import TemplateGuide from '../components/import/TemplateGuide';
import type {
  ClientEntity,
  EntitySummary,
  ImportSheet,
  TrialBalanceRow,
} from '../types';
import type { ParsedUpload } from '../utils/parseTrialBalanceWorkbook';
import { useMappingStore } from '../store/mappingStore';
import { useOrganizationStore } from '../store/organizationStore';
import scrollPageToTop from '../utils/scroll';
import { slugify } from '../utils/slugify';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export default function Import() {
  const { user } = useAuthStore();
  const userId = user?.id ?? null;
  const navigate = useNavigate();
  const [isImporting, setIsImporting] = useState(false);
  const imports = useImportStore((state) => state.imports);
  const fetchImports = useImportStore((state) => state.fetchImports);
  const historyLoading = useImportStore((state) => state.isLoading);
  const historyError = useImportStore((state) => state.error);
  const recordImport = useImportStore((state) => state.recordImport);
  const deleteImport = useImportStore((state) => state.deleteImport);
  const page = useImportStore((state) => state.page);
  const pageSize = useImportStore((state) => state.pageSize);
  const total = useImportStore((state) => state.total);
  const setPage = useImportStore((state) => state.setPage);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const companies = useOrganizationStore((state) => state.companies);
  const fetchOrganizations = useOrganizationStore((state) => state.fetchForUser);
  const orgLoading = useOrganizationStore((state) => state.isLoading);
  const orgError = useOrganizationStore((state) => state.error);
  const fetchFileRecords = useMappingStore((state) => state.fetchFileRecords);

  useEffect(() => {
    if (user?.email) {
      fetchOrganizations(user.email);
    }
  }, [fetchOrganizations, user?.email]);

  const clientSummaries = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    companies.forEach((company) => {
      company.clients.forEach((client) => {
        if (!map.has(client.id)) {
          map.set(client.id, { id: client.id, name: client.name });
        }
      });
    });
    return Array.from(map.values());
  }, [companies]);

  const importsWithClientNames = useMemo(() => {
    const clientLookup = new Map(clientSummaries.map((client) => [client.id, client.name]));
    return imports.map((importItem) => ({
      ...importItem,
      clientName: importItem.clientName ?? clientLookup.get(importItem.clientId),
    }));
  }, [clientSummaries, imports]);

  const singleClient = clientSummaries.length === 1 ? clientSummaries[0] : null;

  useEffect(() => {
    if (!userId) {
      return;
    }

    fetchImports({ userId, clientId: singleClient?.id, page, pageSize });
  }, [fetchImports, userId, singleClient?.id, page, pageSize]);

  const handleDeleteImport = async (importId: string) => {
    if (!importId) {
      return;
    }

    const importToDelete = importsWithClientNames.find((item) => item.id === importId);
    const fileName = importToDelete?.fileName ?? 'Import';

    try {
      await deleteImport(importId);
      setError(null);
      setSuccess(`File '${fileName}' deleted successfully`);
    } catch (deleteError) {
      setSuccess(null);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Unable to delete import. Please try again.'
      );
    }
  };

  const handleFileImport = async (
    rows: TrialBalanceRow[],
    clientId: string,
    selectedEntities: ClientEntity[],
    headerMap: Record<string, string | null>,
    glMonths: string[],
    fileName: string,
    file: File,
    sheetSelections: ImportSheet[],
    sheetUploads: ParsedUpload[],
  ) => {
    setIsImporting(true);
    setError(null);
    setSuccess(null);

    try {
      if (!user) {
        throw new Error('You must be signed in to upload files.');
      }

      if (selectedEntities.length === 0) {
        throw new Error('Please select at least one entity to import.');
      }

      const normalizeEntityValue = (value?: string | null) => {
        const normalized = slugify(value ?? '');
        if (normalized && normalized.length > 0) {
          return normalized;
        }
        return (value ?? '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
      };

      const entityLookup = new Map<string, ClientEntity>();
      selectedEntities.forEach((entity) => {
        const variants = new Set([
          entity.name,
          entity.displayName,
          entity.entityName,
          ...entity.aliases,
        ]);
        variants.forEach((variant) => {
          const normalized = normalizeEntityValue(variant);
          if (normalized.length > 0 && !entityLookup.has(normalized)) {
            entityLookup.set(normalized, entity);
          }
        });
      });

      const entityRowCounts = new Map<string, number>();
      const resolvedRows = rows.map((row) => {
        const matchedEntity = (() => {
          const normalized = normalizeEntityValue(row.entity);
          const matched = normalized.length > 0 ? entityLookup.get(normalized) : null;
          if (matched) {
            return matched;
          }
          if (selectedEntities.length === 1) {
            return selectedEntities[0];
          }
          return null;
        })();

        if (!matchedEntity) {
          return row;
        }

        entityRowCounts.set(
          matchedEntity.id,
          (entityRowCounts.get(matchedEntity.id) ?? 0) + 1,
        );

        const canonicalName = matchedEntity.displayName ?? matchedEntity.name;

        if (row.entity === canonicalName) {
          return row;
        }

        return { ...row, entity: canonicalName };
      });

      const singleEntity = selectedEntities.length === 1 ? selectedEntities[0] : null;
      if (singleEntity && (entityRowCounts.get(singleEntity.id) ?? 0) === 0) {
        entityRowCounts.set(singleEntity.id, resolvedRows.length);
      }

      const entitiesForMetadata = selectedEntities.map((entity) => ({
        entityId: entity.id,
        entityName: entity.displayName ?? entity.name,
        displayName: entity.displayName ?? entity.name,
        rowCount: entityRowCounts.get(entity.id) ?? 0,
        isSelected: true,
      }));

      const mappingEntities: EntitySummary[] = selectedEntities.map((entity) => ({
        id: entity.id,
        name: entity.displayName ?? entity.name,
      }));

      const entityIds = mappingEntities.map((entity) => entity.id);

      const ingestEntities = selectedEntities.map((entity) => ({
        id: entity.id,
        name: entity.displayName ?? entity.name,
        aliases: entity.aliases,
      }));

      const importId = crypto.randomUUID();
      const fileType = file.type || 'application/octet-stream';

      // Use the first GL month for the import record, or a placeholder if none detected
      const primaryPeriod =
        glMonths.length > 0 ? glMonths[0] : new Date().toISOString().slice(0, 7);

      const sheets =
        sheetSelections.length > 0
          ? sheetSelections.map((sheet) => ({
              ...sheet,
              isSelected: sheet.isSelected ?? true,
            }))
          : (() => {
              const counts = new Map<string, number>();
              if (glMonths.length === 0) {
                counts.set(primaryPeriod, rows.length);
              } else {
                glMonths.forEach((month) => counts.set(month, 0));
                rows.forEach((row) => {
                  const key = row.glMonth ?? primaryPeriod;
                  counts.set(key, (counts.get(key) ?? 0) + 1);
                });
              }

              return Array.from(counts.entries()).map(([sheetName, count]) => ({
                sheetName,
                glMonth: sheetName,
                rowCount: count,
                isSelected: true,
              }));
            })();

      await recordImport({
        id: importId,
        clientId,
        userId: user.id,
        fileName,
        fileSize: file.size,
        fileType,
        period: primaryPeriod,
        timestamp: new Date().toISOString(),
        status: 'completed',
        rowCount: resolvedRows.length,
        importedBy: user.email,
        sheets,
        entities: entitiesForMetadata,
      });

      const ingestPayload = {
        fileUploadId: importId,
        clientId,
        fileName,
        headerMap,
        sheets: sheetUploads.map((sheet) => ({
          sheetName: sheet.sheetName,
          glMonth: sheet.metadata.glMonth || sheet.metadata.sheetNameDate || undefined,
          isSelected: true,
          rows: sheet.rows,
          firstDataRowIndex: sheet.firstDataRowIndex,
        })),
        entities: ingestEntities,
      };

      const ingestResponse = await fetch(`${API_BASE_URL}/file-records/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ingestPayload),
      });

      if (!ingestResponse.ok) {
        throw new Error(`Failed to ingest file records (${ingestResponse.status})`);
      }

      await fetchFileRecords(importId, {
        clientId,
        entities: mappingEntities,
        entityIds,
        period: primaryPeriod,
      });

      setSuccess('File imported successfully');
      scrollPageToTop({ behavior: 'auto' });
      navigate(`/gl/mapping/${importId}?stage=mapping`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import file');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="py-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Data Import</h1>
          <p className="mt-1 text-sm text-gray-500">
            Import trial balance data from CSV files
          </p>
        </div>
        {singleClient && (
          <div className="inline-flex items-center rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700">
            Client: {singleClient.name}
          </div>
        )}
      </div>

      {orgError && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {orgError}
        </div>
      )}

      {orgLoading && (
        <p className="text-sm text-gray-500">Loading clients…</p>
      )}

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r-lg">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
            <div className="ml-auto pl-3">
              <div className="-mx-1.5 -my-1.5">
                <button
                  onClick={() => setError(null)}
                  className="inline-flex rounded-md p-1.5 text-red-500 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-red-50 focus:ring-red-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded-r-lg">
          <div className="flex">
            <div className="flex-shrink-0">
              <CheckCircle2 className="h-5 w-5 text-green-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-700">{success}</p>
            </div>
            <div className="ml-auto pl-3">
              <div className="-mx-1.5 -my-1.5">
                <button
                  onClick={() => setSuccess(null)}
                  className="inline-flex rounded-md p-1.5 text-green-500 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-green-50 focus:ring-green-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-medium text-gray-900">Import Trial Balance</h2>
            </CardHeader>
            <CardContent>
              <ImportForm
                onImport={handleFileImport}
                isImporting={isImporting}
              />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-medium text-gray-900">Template Guide</h2>
            </CardHeader>
            <CardContent>
              <TemplateGuide />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-medium text-gray-900">Import History</h2>
        </CardHeader>
        {historyError && (
          <div className="px-6 text-sm text-red-600">{historyError}</div>
        )}
        <ImportHistory
          imports={importsWithClientNames}
          isLoading={historyLoading}
          page={page}
          pageSize={pageSize}
          total={total}
          onDelete={handleDeleteImport}
          onPageChange={(nextPage) => {
            setPage(nextPage);
            if (userId) {
              fetchImports({
                userId,
                clientId: singleClient?.id,
                page: nextPage,
                pageSize,
              });
            }
          }}
        />
      </Card>
    </div>
  );
}