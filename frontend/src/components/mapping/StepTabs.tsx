export type MappingStep = 'mapping' | 'distribution' | 'review';

const DEFAULT_STEPS: { key: MappingStep; label: string; description?: string }[] = [
  { key: 'mapping', label: 'Mapping', description: 'Assign GL accounts to the chart of accounts' },
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
    <div className="border-b border-gray-200 dark:border-slate-700">
      <nav className="-mb-px flex flex-col gap-2 sm:flex-row" aria-label="Mapping workflow steps">
        {steps.map(step => {
          const isActive = step.key === activeStep;
          const baseClasses =
            'flex-1 border-b-2 px-3 py-3 text-left text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900';
          const stateClasses = isActive
            ? ' border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-300'
            : ' border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-slate-600 dark:hover:text-gray-200';

          return (
            <button
              key={step.key}
              type="button"
              onClick={() => onStepChange(step.key)}
              className={`${baseClasses}${stateClasses}`}
            >
              <span className="block text-base font-semibold">
                {step.label}
              </span>
              {step.description && (
                <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
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
