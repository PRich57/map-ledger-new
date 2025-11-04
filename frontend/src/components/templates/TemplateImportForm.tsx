import React, { useState } from 'react';
import { Upload } from 'lucide-react';
import { useTemplateStore } from '../../store/templateStore';

interface Props {
  onClose: () => void;
}

export default function TemplateImportForm({ onClose }: Props) {
  const { importTemplateFromFile } = useTemplateStore();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('General');
  const [interval, setInterval] = useState<'Monthly' | 'Quarterly'>('Monthly');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name.trim()) {
      setError('File and template name are required');
      return;
    }
    setError('');
    await importTemplateFromFile(file, { name: name.trim(), industry, interval });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div>
        <label className="block text-sm font-medium text-gray-700">Template Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Industry</label>
        <input
          type="text"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Interval</label>
        <select
          value={interval}
          onChange={(e) => setInterval(e.target.value as 'Monthly' | 'Quarterly')}
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        >
          <option value="Monthly">Monthly</option>
          <option value="Quarterly">Quarterly</option>
        </select>
      </div>
      <div className="flex items-center justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg">
        {file ? (
          <span className="text-sm text-gray-900">{file.name}</span>
        ) : (
          <label htmlFor="file-upload" className="cursor-pointer">
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <input
              id="file-upload"
              type="file"
              accept=".csv, .xlsx"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <p className="text-sm text-gray-600">Upload CSV or XLSX</p>
          </label>
        )}
      </div>
      <div className="flex justify-end space-x-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-md border border-gray-300 bg-white text-sm"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm"
        >
          Build Template
        </button>
      </div>
    </form>
  );
}
