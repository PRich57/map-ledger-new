import { useEffect, useState } from 'react';

interface ColumnMatcherProps {
  sourceHeaders: string[];
  destinationHeaders: string[];
  initialAssignments?: Record<string, string | null>;
  onComplete: (mapping: Record<string, string | null>) => void | Promise<void>;
}

function normalize(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function guessMatches(source: string[], dest: string[]): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  const used = new Set<string>();

  dest.forEach(d => {
    const normalizedDest = normalize(d);
    let match: string | undefined;

    const available = source.filter(s => !used.has(s));

    if (normalizedDest === 'accountdescription') {
      match = available.find(s => normalize(s).includes('description'));
    } else if (normalizedDest === 'netchange') {
      const netChangeMatches = available.filter(s => normalize(s).includes('netchange'));
      match = netChangeMatches.length > 0 ? netChangeMatches[netChangeMatches.length - 1] : undefined;
    } else {
      match = available.find(s => normalize(s) === normalizedDest);
    }

    if (match) {
      used.add(match);
      result[d] = match;
    } else {
      result[d] = null;
    }
  });

  return result;
}

export default function ColumnMatcher({
  sourceHeaders,
  destinationHeaders,
  initialAssignments,
  onComplete,
}: ColumnMatcherProps) {
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [unassigned, setUnassigned] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const annotatedHeaders = sourceHeaders.map((label, idx, arr) => {
      const duplicates = arr.filter(v => v === label);
      if (duplicates.length > 1) {
        const colLetter = String.fromCharCode(65 + idx);
        return `${label} - Column ${colLetter}`;
      }
      return label;
    });

    const seedAssignments: Record<string, string | null> = {};
    const used = new Set<string>();

    if (initialAssignments) {
      destinationHeaders.forEach((dest) => {
        const desired = initialAssignments[dest];
        if (!desired) {
          return;
        }

        const match = annotatedHeaders.find(
          (header) => !used.has(header) && (header === desired || normalize(header) === normalize(desired))
        );

        if (match) {
          seedAssignments[dest] = match;
          used.add(match);
        }
      });
    }

    const remainingSources = annotatedHeaders.filter((header) => !used.has(header));
    const remainingDestinations = destinationHeaders.filter((dest) => !seedAssignments[dest]);

    const guesses = guessMatches(remainingSources, remainingDestinations);
    const mergedAssignments = { ...seedAssignments, ...guesses };
    const assignedSources = new Set(
      Object.values(mergedAssignments).filter(Boolean) as string[]
    );

    setAssignments(mergedAssignments);
    setUnassigned(annotatedHeaders.filter((header) => !assignedSources.has(header)));
  }, [sourceHeaders, destinationHeaders, initialAssignments]);

  const handleDrop = (src: string, dest: string) => {
    setAssignments(prev => {
      const updated = { ...prev };
      const prevDest = Object.keys(prev).find(k => prev[k] === src);
      if (prevDest) updated[prevDest] = null;
      updated[dest] = src;
      return updated;
    });
    setUnassigned(prev => prev.filter(h => h !== src));
  };

  const handleRemove = (dest: string) => {
    setAssignments(prev => {
      const updated = { ...prev };
      const removed = updated[dest];
      updated[dest] = null;
      if (removed) setUnassigned((prevUnassigned) => [...prevUnassigned, removed]);
      return updated;
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
      <div>
        <h3 className="font-semibold mb-2">Source Headers</h3>
        {unassigned.map(header => (
          <div
            key={header}
            className="p-2 bg-gray-100 border rounded cursor-move"
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', header)}
          >
            {header}
          </div>
        ))}
      </div>

      <div>
        <h3 className="font-semibold mb-2">Match to Template</h3>
        {destinationHeaders.map(dest => (
          <div
            key={dest}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const src = e.dataTransfer.getData('text/plain');
              handleDrop(src, dest);
            }}
            className="p-2 mb-2 min-h-[3rem] border border-dashed rounded bg-white"
          >
            <div className="text-sm font-medium text-gray-700 mb-1 flex justify-between items-center">
              <span>{dest}</span>
              {assignments[dest] && (
                <button
                  onClick={() => handleRemove(dest)}
                  className="text-xs text-red-500 hover:underline ml-2"
                  type="button"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="text-sm text-gray-900">
              {assignments[dest] ?? <span className="italic text-gray-400">(unassigned)</span>}
            </div>
          </div>
        ))}

        <div className="space-y-2 mt-4">
          <button
            onClick={async () => {
              try {
                setError(null);
                setIsSaving(true);
                await onComplete(assignments);
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : 'Unable to save header mappings'
                );
              } finally {
                setIsSaving(false);
              }
            }}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Confirm Mappings'}
          </button>
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}