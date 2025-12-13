import { FileSpreadsheet, AlertCircle, Download } from 'lucide-react';

export default function TemplateGuide() {
  const downloadTemplate = () => {
    const template = `GL_Month_Quarter,GL_Account,GL_Description,Net_Change,User_Defined_Field_1,User_Defined_Field_2,User_Defined_Field_3
2024-01-01,5000-000,Sample Expense,1000,,,
2024-01-01,5100-000,Another Expense,2000,,,
`;
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
    <div className="lg:col-span-1">
      <div className="space-y-4">
        <div className="flex items-start space-x-3">
          <FileSpreadsheet className="h-5 w-5 text-blue-500 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-gray-900">Required CSV Format</h3>
            <p className="mt-1 text-sm text-gray-500">Your CSV file must include the following columns:</p>
            <ul className="mt-2 text-sm text-gray-500 list-disc list-inside space-y-1">
              <li>GL_Month_Quarter (YYYY-MM-01 or YYYY-Q#)</li>
              <li>GL_Account</li>
              <li>GL_Description</li>
              <li>Net_Change</li>
              <li>User_Defined_Field_1 (optional)</li>
              <li>User_Defined_Field_2 (optional)</li>
              <li>User_Defined_Field_3 (optional)</li>
            </ul>
          </div>
        </div>

        <div className="flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-gray-900">Important Notes</h3>
            <ul className="mt-1 text-sm text-gray-500 list-disc list-inside space-y-1">
              <li>Use comma (,) as the delimiter</li>
              <li>Numbers should not include currency symbols</li>
              <li>Use period (.) as decimal separator</li>
              <li>First row must be the header row</li>
              <li>GL_Month_Quarter format depends on template interval</li>
              <li>Net_Change can be positive (debit) or negative (credit)</li>
            </ul>
          </div>
        </div>

        <div className="mt-4">
          <button
            onClick={downloadTemplate}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Download className="h-4 w-4 mr-2" />
            Download Template
          </button>
        </div>
      </div>
    </div>
  );
}
