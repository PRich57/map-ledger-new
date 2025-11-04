interface Option {
  value: string;
  label: string;
}

interface MultiSelectProps {
  label?: string;
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

export default function MultiSelect({ label, options, value, onChange, disabled }: MultiSelectProps) {
  const toggle = (val: string, checked: boolean) => {
    if (checked) {
      onChange([...value, val]);
    } else {
      onChange(value.filter(v => v !== val));
    }
  };

  return (
    <fieldset disabled={disabled} className="space-y-2">
      {label && (
        <legend className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </legend>
      )}
      {options.map(opt => (
        <label key={opt.value} className="flex items-center space-x-2">
          <input
            type="checkbox"
            value={opt.value}
            checked={value.includes(opt.value)}
            onChange={e => toggle(opt.value, e.target.checked)}
            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">{opt.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

