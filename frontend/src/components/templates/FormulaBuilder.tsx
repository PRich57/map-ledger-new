import { useState } from 'react';
import { Datapoint } from '../../types';
import { Plus, X, Calculator } from 'lucide-react';

interface FormulaBuilderProps {
  datapoints: Datapoint[];
  value: string;
  onChange: (formula: string) => void;
}

export default function FormulaBuilder({ datapoints, value, onChange }: FormulaBuilderProps) {
  const [error, setError] = useState<string>('');

  const operators = ['+', '-', '*', '/', '(', ')', '%'];
  
  const handleAddDatapoint = (dp: Datapoint) => {
    onChange(`${value} [${dp.accountName}]`);
  };

  const handleAddOperator = (op: string) => {
    onChange(`${value} ${op}`);
  };

  const handleClear = () => {
    onChange('');
    setError('');
  };

  const validateFormula = (formula: string) => {
    try {
      // Basic validation for matching brackets
      const brackets = formula.match(/[()]/g) || [];
      let count = 0;
      for (const bracket of brackets) {
        if (bracket === '(') count++;
        if (bracket === ')') count--;
        if (count < 0) throw new Error('Invalid bracket placement');
      }
      if (count !== 0) throw new Error('Unmatched brackets');

      // Check for invalid operator sequences
      if (/[+\-*/%]{2,}/.test(formula)) throw new Error('Invalid operator sequence');

      setError('');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid formula');
      return false;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <div className="flex-1">
          <div className="font-mono bg-gray-50 p-3 rounded-lg border border-gray-200 min-h-[60px] whitespace-pre-wrap break-all">
            {value || <span className="text-gray-400">Enter your formula...</span>}
          </div>
          {error && (
            <p className="mt-1 text-sm text-red-600">{error}</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="p-2 text-gray-500 hover:text-red-600 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Operators</h4>
          <div className="flex flex-wrap gap-2">
            {operators.map((op) => (
              <button
                key={op}
                type="button"
                onClick={() => handleAddOperator(op)}
                className="px-3 py-1.5 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                {op}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Available Datapoints</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
            {datapoints
              .filter(dp => dp.type !== 'Calculated')
              .map((dp) => (
                <button
                  key={dp.id}
                  type="button"
                  onClick={() => handleAddDatapoint(dp)}
                  className="flex items-center justify-between p-2 text-sm text-left bg-white hover:bg-gray-50 border border-gray-200 rounded-md transition-colors group"
                >
                  <span className="font-medium text-gray-900">{dp.accountName}</span>
                  <Plus className="h-4 w-4 text-gray-400 group-hover:text-indigo-600" />
                </button>
              ))}
          </div>
        </div>

        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex items-start space-x-3">
            <Calculator className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-blue-900">Formula Tips</h4>
              <ul className="mt-1 text-sm text-blue-700 list-disc list-inside space-y-1">
                <li>Use square brackets [Account Name] to reference other datapoints</li>
                <li>Basic operators: + (add), - (subtract), * (multiply), / (divide), % (percentage)</li>
                <li>Use parentheses ( ) to group operations</li>
                <li>Example: ([Revenue] - [Expenses]) / [Total Assets] * 100</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}