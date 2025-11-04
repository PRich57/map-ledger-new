import React, { useState } from 'react';
import { Datapoint, COATemplate } from '../../types';
import { Save, X } from 'lucide-react';
import FormulaBuilder from './FormulaBuilder';
import { useTemplateStore } from '../../store/templateStore';

interface DatapointFormProps {
  template: COATemplate;
  initialData?: Datapoint;
  onSubmit: (data: Omit<Datapoint, 'id' | 'templateId' | 'sortOrder'>) => void;
  onCancel: () => void;
}

export default function DatapointForm({ template, initialData, onSubmit, onCancel }: DatapointFormProps) {
  const { datapoints } = useTemplateStore();
  const templateDatapoints = datapoints[template.id] || [];
  
  const [accountName, setAccountName] = useState(initialData?.accountName ?? '');
  const [accountDescription, setAccountDescription] = useState(initialData?.accountDescription ?? '');
  const [type, setType] = useState<Datapoint['type']>(initialData?.type ?? 'Financial');
  const [accountType, setAccountType] = useState<Datapoint['accountType']>(initialData?.accountType ?? 'Assets');
  const [balanceType, setBalanceType] = useState<Datapoint['balanceType']>(initialData?.balanceType ?? 'Debit');
  const [coreGLAccount, setCoreGLAccount] = useState(initialData?.coreGLAccount ?? '');
  const [functionalGroupId, setFunctionalGroupId] = useState(initialData?.functionalGroupId ?? template.functionalGroups[0]?.id);
  const [operationalGroupId, setOperationalGroupId] = useState(initialData?.operationalGroupId ?? template.operationalGroups[0]?.id);
  const [formula, setFormula] = useState(initialData?.formula ?? '');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!accountName.trim()) {
      setError('Account name is required');
      return;
    }

    if (!coreGLAccount.trim() || !/^\d{4}$/.test(coreGLAccount)) {
      setError('Core GL Account must be exactly 4 digits');
      return;
    }

    if (type === 'Calculated' && !formula.trim()) {
      setError('Formula is required for calculated datapoints');
      return;
    }

    setError('');
    onSubmit({
      accountName: accountName.trim(),
      accountDescription: accountDescription.trim(),
      type,
      accountType,
      balanceType,
      coreGLAccount,
      functionalGroupId,
      operationalGroupId,
      formula: type === 'Calculated' ? formula.trim() : undefined,
    });
  };

  return (
    <div className="space-y-6">
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

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Account Name</label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Core GL Account</label>
            <input
              type="text"
              value={coreGLAccount}
              onChange={(e) => setCoreGLAccount(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="4 digits"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">Account Description</label>
            <textarea
              value={accountDescription}
              onChange={(e) => setAccountDescription(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as Datapoint['type'])}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="Financial">Financial</option>
              <option value="Operational">Operational</option>
              <option value="Calculated">Calculated</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Account Type</label>
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value as Datapoint['accountType'])}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="Assets">Assets</option>
              <option value="Liabilities">Liabilities</option>
              <option value="Equity">Equity</option>
              <option value="Revenue">Revenue</option>
              <option value="Expenses">Expenses</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Balance Type</label>
            <select
              value={balanceType}
              onChange={(e) => setBalanceType(e.target.value as Datapoint['balanceType'])}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="Debit">Debit Balance</option>
              <option value="Credit">Credit Balance</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Functional Group</label>
            <select
              value={functionalGroupId}
              onChange={(e) => setFunctionalGroupId(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              {template.functionalGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} ({group.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Operational Group</label>
            <select
              value={operationalGroupId}
              onChange={(e) => setOperationalGroupId(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              {template.operationalGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} ({group.code})
                </option>
              ))}
            </select>
          </div>

          {type === 'Calculated' && (
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Formula Builder</label>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <FormulaBuilder
                  datapoints={templateDatapoints.filter(dp => dp.id !== initialData?.id)}
                  value={formula}
                  onChange={setFormula}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <Save className="h-4 w-4 mr-2" />
            {initialData ? 'Update Datapoint' : 'Add Datapoint'}
          </button>
        </div>
      </form>
    </div>
  );
}