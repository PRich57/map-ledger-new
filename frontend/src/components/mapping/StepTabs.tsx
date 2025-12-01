export type MappingStep = 'mapping' | 'reconcile' | 'distribution' | 'review';

const DEFAULT_STEPS: { key: MappingStep; label: string; description?: string }[] = [
  { key: 'mapping', label: 'Mapping', description: 'Assign GL accounts to the chart of accounts' },
  {
    key: 'reconcile',
    label: 'Reconcile',
    description: 'Confirm mapped activity against the standard chart of accounts',
  },
  { key: 'distribution', label: 'Distribution', description: 'Configure allocation rules and drivers' },
  { key: 'review', label: 'Review', description: 'Validate allocations before publishing' },
];

interface StepTabsProps {
  activeStep: MappingStep;
  onStepChange: (step: MappingStep) => void;
  steps?: { key: MappingStep; label: string; description?: string }[];
}

const StepTabs = ({ activeStep, onStepChange, steps = DEFAULT_STEPS }: StepTabsProps) => {
  return (
    <div className="pb-1">
      <nav
        className="-mb-px flex flex-col gap-3 border-b border-gray-200 sm:flex-row dark:border-slate-700"
        aria-label="Mapping workflow steps"
      >
        {steps.map(step => {
          const isActive = step.key === activeStep;
          const baseClasses =
            'group relative flex-1 rounded-t-lg border px-4 py-3 text-left text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900';
          const stateClasses = isActive
            ? ' -mb-px border-blue-500 bg-slate-50 text-slate-900 shadow-sm hover:bg-slate-100 dark:border-blue-400 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700'
            : ' border-transparent text-slate-700 hover:border-gray-200 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-white';

          return (
            <button
              key={step.key}
              type="button"
              onClick={() => onStepChange(step.key)}
              className={`${baseClasses}${stateClasses}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="block text-base font-semibold">
                {step.label}
              </span>
              {step.description && (
                <span className="mt-1 block text-xs text-gray-600 dark:text-gray-400">
                  {step.description}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default StepTabs;
