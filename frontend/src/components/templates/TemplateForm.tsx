import React, { useState } from 'react';
import { COATemplate } from '../../types';
import { Plus, X, Save } from 'lucide-react';

interface TemplateFormProps {
  initialData?: COATemplate;
  onSubmit: (data: Omit<COATemplate, 'id'>) => void;
  onCancel: () => void;
}

const INDUSTRIES = [
  'Transportation',
  'Veterinary',
  'Construction',
  'Manufacturing',
  'Leasing',
  'Healthcare',
  'Real Estate',
  'Hospital',
  'Hospitality',
  'Dental',
];

export default function TemplateForm({ initialData, onSubmit, onCancel }: TemplateFormProps) {
  const [name, setName] = useState(initialData?.name ?? '');
  const [industry, setIndustry] = useState(initialData?.industry ?? INDUSTRIES[0]);
  const [interval, setInterval] = useState<'Monthly' | 'Quarterly'>(initialData?.interval ?? 'Monthly');
  const [functionalGroups, setFunctionalGroups] = useState(initialData?.functionalGroups ?? []);
  const [operationalGroups, setOperationalGroups] = useState(initialData?.operationalGroups ?? []);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupCode, setNewGroupCode] = useState('');
  const [activeGroupType, setActiveGroupType] = useState<'functional' | 'operational'>('functional');
  const [error, setError] = useState('');

  const validateGroupCode = (code: string) => {
    return /^\d{3}$/.test(code);
  };

  const handleAddGroup = () => {
    if (!newGroupName.trim()) {
      setError('Group name is required');
      return;
    }

    if (!validateGroupCode(newGroupCode)) {
      setError('Group code must be exactly 3 digits');
      return;
    }

    const groups = activeGroupType === 'functional' ? functionalGroups : operationalGroups;
    if (groups.some(g => g.code === newGroupCode)) {
      setError('Group code must be unique');
      return;
    }

    setError('');
    const newGroup = {
      id: crypto.randomUUID(),
      name: newGroupName.trim(),
      code: newGroupCode,
    };

    if (activeGroupType === 'functional') {
      setFunctionalGroups([...functionalGroups, newGroup]);
    } else {
      setOperationalGroups([...operationalGroups, newGroup]);
    }

    setNewGroupName('');
    setNewGroupCode('');
  };

  const handleRemoveGroup = (id: string, type: 'functional' | 'operational') => {
    if (type === 'functional') {
      setFunctionalGroups(functionalGroups.filter(g => g.id !== id));
    } else {
      setOperationalGroups(operationalGroups.filter(g => g.id !== id));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }
    if (functionalGroups.length === 0 && operationalGroups.length === 0) {
      setError('At least one group is required');
      return;
    }
    setError('');
    onSubmit({
      name: name.trim(),
      industry,
      interval,
      functionalGroups,
      operationalGroups,
    });
  };

  return (
    <div className="space-y-8">
      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <X className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Template Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="col-span-3 md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              placeholder="Enter template name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              {INDUSTRIES.map((ind) => (
                <option key={ind} value={ind}>{ind}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Interval</label>
            <select
              value={interval}
              onChange={(e) => setInterval(e.target.value as 'Monthly' | 'Quarterly')}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="Monthly">Monthly</option>
              <option value="Quarterly">Quarterly</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Groups Configuration</h3>
        
        <div className="flex space-x-4 mb-6">
          <button
            type="button"
            onClick={() => setActiveGroupType('functional')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeGroupType === 'functional'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Functional Groups ({functionalGroups.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveGroupType('operational')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeGroupType === 'operational'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Operational Groups ({operationalGroups.length})
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex space-x-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Enter group name"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
            </div>
            <div className="w-32">
              <input
                type="text"
                placeholder="Code (123)"
                value={newGroupCode}
                onChange={(e) => setNewGroupCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
            </div>
            <button
              type="button"
              onClick={handleAddGroup}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Group
            </button>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(activeGroupType === 'functional' ? functionalGroups : operationalGroups).map((group) => (
                <div
                  key={group.id}
                  className="flex items-center justify-between p-3 bg-white rounded-md border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center space-x-3">
                    <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-indigo-100 text-indigo-600 text-sm font-medium">
                      {group.code}
                    </span>
                    <span className="font-medium text-gray-900">{group.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveGroup(group.id, activeGroupType)}
                    className="text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end space-x-4 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <Save className="h-4 w-4 mr-2" />
          {initialData ? 'Update Template' : 'Create Template'}
        </button>
      </div>
    </div>
  );
}