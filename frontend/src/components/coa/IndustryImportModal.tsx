import { DragEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, UploadCloud, X } from 'lucide-react';

interface IndustryImportModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: { name: string; file: File }) => Promise<void>;
}

const ACCEPTED_FILE_TYPES = '.csv,.xlsx,.xls';

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
};

export default function IndustryImportModal({
  open,
  onClose,
  onSubmit,
}: IndustryImportModalProps) {
  const [industryName, setIndustryName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setIndustryName('');
      setFile(null);
      setError(null);
      setIsSubmitting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, isSubmitting]);

  if (!open) {
    return null;
  }

  const handleFileSelect = (selectedFile: File | null) => {
    setFile(selectedFile);
    setError(null);
    setIsDragActive(false);
    if (!selectedFile && fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const dropped = event.dataTransfer.files?.[0] ?? null;
    if (dropped) {
      handleFileSelect(dropped);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = industryName.trim();
    if (!trimmed) {
      setError('Industry name is required.');
      return;
    }
    if (!file) {
      setError('Upload a COA file to continue.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit({ name: trimmed, file });
      onClose();
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : 'Unable to add industry.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const dropzoneClasses = isDragActive
    ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300'
    : 'border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/40';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="industry-import-title"
        className="w-full max-w-lg rounded-xl bg-white shadow-xl"
        onClick={event => event.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="industry-import-title" className="text-lg font-semibold text-slate-900">
                Add an industry
              </h2>
              <p className="text-sm text-slate-600">
                Create a new industry and import its chart of accounts.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-full p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Industry name
            <input
              type="text"
              value={industryName}
              onChange={event => {
                setIndustryName(event.target.value);
                setError(null);
              }}
              placeholder="e.g., Construction"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isSubmitting}
              autoFocus
            />
          </label>

          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-700">COA file</div>
            <div
              className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${dropzoneClasses}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={event => {
                event.preventDefault();
                setIsDragActive(true);
              }}
              onDragLeave={() => setIsDragActive(false)}
              onDrop={handleDrop}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              role="button"
              tabIndex={0}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                className="sr-only"
                onChange={event => handleFileSelect(event.target.files?.[0] ?? null)}
                disabled={isSubmitting}
              />
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-slate-900">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-medium">{file.name}</span>
                  </div>
                  <span className="text-xs text-slate-500">{formatFileSize(file.size)}</span>
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      handleFileSelect(null);
                    }}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    Remove file
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-600">
                  <UploadCloud className="h-6 w-6" />
                  <p className="text-sm">
                    <span className="font-semibold text-indigo-600">Click to upload</span> or drag
                    and drop
                  </p>
                  <p className="text-xs text-slate-500">CSV or Excel files (.csv, .xlsx, .xls)</p>
                </div>
              )}
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-indigo-400"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing
                </>
              ) : (
                'Create Industry'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
