import type { ChangeEvent, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type Option = { id: string; value: string; label: string };

interface SearchableSelectProps<TOption extends Option> {
  id?: string;
  value: string;
  options: TOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  getOptionValue?: (option: TOption) => string;
  getOptionLabel?: (option: TOption) => string;
  noOptionsMessage?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
}

const baseInputClasses =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

type MenuStyles = {
  top: number;
  left: number;
  width: number;
};

const DROPDOWN_VERTICAL_OFFSET = 4;

export default function SearchableSelect<TOption extends Option>({
  id,
  value,
  options,
  placeholder = 'Search and select',
  disabled = false,
  className = '',
  getOptionValue,
  getOptionLabel,
  noOptionsMessage = 'No matches found',
  onChange,
  onBlur,
}: SearchableSelectProps<TOption>) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const resolvedId = id ?? inputId;
  const valueSelector = useCallback(
    (option: TOption) => (getOptionValue ? getOptionValue(option) : option.value),
    [getOptionValue],
  );
  const labelSelector = useCallback(
    (option: TOption) => (getOptionLabel ? getOptionLabel(option) : option.label),
    [getOptionLabel],
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const previousValueRef = useRef<string | null>(null);
  const lastSyncedLabelRef = useRef<string>('');
  const [menuStyles, setMenuStyles] = useState<MenuStyles | null>(null);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredOptions = useMemo(() => {
    if (!normalizedSearch) {
      return options;
    }

    return options.filter(option => {
      const label = labelSelector(option).toLowerCase();
      const optionValue = valueSelector(option).toLowerCase();
      return label.includes(normalizedSearch) || optionValue.includes(normalizedSearch);
    });
  }, [normalizedSearch, options, labelSelector, valueSelector]);

  const selectedOption = useMemo(
    () => options.find(option => valueSelector(option) === value),
    [options, value, valueSelector],
  );

  useEffect(() => {
    const nextLabel = selectedOption ? labelSelector(selectedOption) : '';
    if (
      value === previousValueRef.current &&
      nextLabel === lastSyncedLabelRef.current
    ) {
      return;
    }
    previousValueRef.current = value;
    lastSyncedLabelRef.current = nextLabel;
    setSearchTerm(nextLabel);
  }, [labelSelector, selectedOption, value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) {
        return;
      }
      if (menuRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
      onBlur?.();
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onBlur]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuStyles(null);
      return undefined;
    }

    if (typeof window === 'undefined') {
      setMenuStyles(null);
      return undefined;
    }

    const updateMenuPosition = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        setMenuStyles(null);
        return;
      }
      setMenuStyles({
        top: rect.bottom + DROPDOWN_VERTICAL_OFFSET,
        left: rect.left,
        width: rect.width,
      });
    };

    updateMenuPosition();
    window.addEventListener('scroll', updateMenuPosition, true);
    window.addEventListener('resize', updateMenuPosition);

    return () => {
      window.removeEventListener('scroll', updateMenuPosition, true);
      window.removeEventListener('resize', updateMenuPosition);
    };
  }, [isOpen]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [normalizedSearch]);

  const handleSelect = (option: TOption) => {
    const optionValue = valueSelector(option);
    setSearchTerm(labelSelector(option));
    setIsOpen(false);
    onChange(optionValue);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setSearchTerm(nextValue);
    setIsOpen(true);

    if (!nextValue.trim()) {
      onChange('');
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      setIsOpen(true);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex(previous => Math.min(previous + 1, filteredOptions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex(previous => Math.max(previous - 1, 0));
    } else if (event.key === 'Enter' && isOpen && filteredOptions[highlightedIndex]) {
      event.preventDefault();
      handleSelect(filteredOptions[highlightedIndex]);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const activeOption = filteredOptions[highlightedIndex];
  const activeDescendant = activeOption ? `${resolvedId}-option-${valueSelector(activeOption)}` : undefined;
  const portalContainer = typeof document !== 'undefined' ? document.body : null;
  const dropdownMenu =
    isOpen && !disabled && menuStyles ? (
      <div
        ref={menuRef}
        role="presentation"
        className="z-50 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
        style={{
          position: 'fixed',
          top: menuStyles.top,
          left: menuStyles.left,
          width: menuStyles.width,
          zIndex: 1000,
        }}
      >
        <ul
          id={listboxId}
          role="listbox"
          className="max-h-60 overflow-y-auto py-1 text-sm"
          aria-label="Search results"
        >
          {filteredOptions.length === 0 ? (
            <li className="px-3 py-2 text-slate-500 dark:text-slate-400">{noOptionsMessage}</li>
          ) : (
            filteredOptions.map((option, index) => {
              const optionId = `${resolvedId}-option-${valueSelector(option)}`;
              const isActive = index === highlightedIndex;

              return (
                <li key={optionId} role="option" id={optionId} aria-selected={valueSelector(option) === value}>
                  <button
                    type="button"
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => handleSelect(option)}
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left transition ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-100'
                        : 'text-slate-700 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="flex-1">{labelSelector(option)}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{valueSelector(option)}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    ) : null;
  const renderedDropdown =
    dropdownMenu && portalContainer ? createPortal(dropdownMenu, portalContainer) : dropdownMenu;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        id={resolvedId}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={isOpen ? activeDescendant : undefined}
        value={searchTerm}
        placeholder={placeholder}
        onFocus={() => setIsOpen(true)}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={onBlur}
        disabled={disabled}
        className={`${baseInputClasses} ${disabled ? 'cursor-not-allowed opacity-75' : ''}`}
      />
      {value && !disabled ? (
        <button
          type="button"
          aria-label="Clear selection"
          onMouseDown={event => event.preventDefault()}
          onClick={() => {
            setSearchTerm('');
            onChange('');
          }}
          className="absolute inset-y-0 right-2 my-1 flex items-center rounded px-2 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 dark:focus:ring-offset-slate-900"
        >
          Clear
        </button>
      ) : null}
      {renderedDropdown}
    </div>
  );
}
