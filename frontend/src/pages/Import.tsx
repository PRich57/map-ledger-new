import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { useImportStore } from '../store/importStore';
import ImportHistory from '../components/import/ImportHistory';
import ImportForm from '../components/import/ImportForm';
import TemplateGuide from '../components/import/TemplateGuide';
import { fileToBase64 } from '../utils/file';
import { ImportPreviewRow, TrialBalanceRow } from '../types';
import { useMappingStore } from '../store/mappingStore';
import { useOrganizationStore } from '../store/organizationStore';
import scrollPageToTop from '../utils/scroll';

export default function Import() {
  const { user } = useAuthStore();
  const userId = user?.id ?? null;
  const navigate = useNavigate();
  const [isImporting, setIsImporting] = useState(false);
  const addImport = useImportStore((state) => state.addImport);
  const deleteImport = useImportStore((state) => state.deleteImport);
  const imports = useImportStore((state) =>
    userId ? state.importsByUser[userId] ?? [] : []
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const companies = useOrganizationStore((state) => state.companies);
  const fetchOrganizations = useOrganizationStore((state) => state.fetchForUser);
  const orgLoading = useOrganizationStore((state) => state.isLoading);
  const orgError = useOrganizationStore((state) => state.error);

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

  const singleClient = clientSummaries.length === 1 ? clientSummaries[0] : null;

  const handleDeleteImport = (importId: string) => {
    if (!userId) {
      return;
    }

    deleteImport(userId, importId);
    setError(null);
    setSuccess('Import removed from history');
  };

  const loadImportedAccounts = useMappingStore(state => state.loadImportedAccounts);

  const handleFileImport = async (
    rows: TrialBalanceRow[],
    clientId: string,
    _companyIds: string[],
    _headerMap: Record<string, string | null>,
    glMonths: string[],
    fileName: string,
    file: File
  ) => {
    setIsImporting(true);
    setError(null);
    setSuccess(null);

    try {
      if (!user) {
        throw new Error('You must be signed in to upload files.');
      }

      const importId = crypto.randomUUID();
      const previewRows: ImportPreviewRow[] = rows.slice(0, 10).map((row) => ({
        accountId: row.accountId,
        description: row.description,
        entity: row.entity,
        netChange: row.netChange,
        glMonth: row.glMonth,
      }));
      const fileData = await fileToBase64(file);
      const fileType = file.type || 'application/octet-stream';

      // Use the first GL month for the import record, or a placeholder if none detected
      const primaryPeriod = glMonths.length > 0 ? glMonths[0] : new Date().toISOString().slice(0, 7);

      addImport(user.id, {
        id: importId,
        clientId,
        fileName,
        fileSize: file.size,
        fileType,
        fileData,
        previewRows,
        period: primaryPeriod,
        timestamp: new Date().toISOString(),
        status: 'completed',
        rowCount: rows.length,
        importedBy: user.email,
      });

      loadImportedAccounts({
        uploadId: importId,
        clientId,
        companyIds: _companyIds,
        period: primaryPeriod,
        rows,
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
        <ImportHistory imports={imports} onDeleteImport={handleDeleteImport} />
      </Card>
    </div>
  );
}