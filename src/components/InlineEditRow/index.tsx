import React, { useRef, useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';

export interface InlineEditRowProps {
  validate?: (value: string) => string | null;
  label: string;
  value: string;
  onSave: (newValue: string) => void;
  inputType?: 'text' | 'tel' | 'number' | 'email';
  inputMode?: 'text' | 'numeric' | 'decimal' | 'tel';
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  isEditing?: boolean;
  onEditStart?: () => void;
  onEditEnd?: () => void;
}

export const InlineEditRow: React.FC<InlineEditRowProps> = ({
  label,
  value,
  onSave,
  inputType = 'text',
  inputMode,
  placeholder,
  prefix,
  suffix,
  isEditing: controlledIsEditing,
  onEditStart,
  onEditEnd,
  validate,
}) => {
  const [internalEditing, setInternalEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const isEditing = controlledIsEditing !== undefined ? controlledIsEditing : internalEditing;

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleBlur = () => {
    if (validate) {
      const err = validate(inputValue);
      if (err) {
        setError(err);
        return;
      }
    }
    setError(null);
    onSave(inputValue);
    if (controlledIsEditing === undefined) {
      setInternalEditing(false);
    }
    onEditEnd?.();
  };

  const handleDone = () => {
    if (validate) {
      const err = validate(inputValue);
      if (err) {
        setError(err);
        return;
      }
    }
    setError(null);
    onSave(inputValue);
    if (controlledIsEditing === undefined) {
      setInternalEditing(false);
    }
    onEditEnd?.();
  };

  const startEdit = () => {
    if (controlledIsEditing === undefined) {
      setInternalEditing(true);
    }
    onEditStart?.();
  };

  const displayValue = `${prefix || ''}${value}${suffix ? ' ' + suffix : ''}`;

  return (
    <div className="border-b border-brand-borderLight" onClick={!isEditing ? startEdit : undefined}>
      <div className="min-h-13 flex items-center justify-between">
        <span className="text-sm font-medium text-brand-dark">{label}</span>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <div className="flex items-center">
                {prefix && <span className="text-base text-brand-mid mr-1">{prefix}</span>}
                <input
                  ref={inputRef}
                  type={inputType}
                  inputMode={inputMode}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onBlur={handleBlur}
                  placeholder={placeholder}
                  className={`text-base text-right min-w-20 bg-transparent border-none outline-none p-0 ${error ? 'text-status-red' : 'text-brand-black'}`}
                />
                {suffix && <span className="text-base text-brand-mid ml-1">{suffix}</span>}
              </div>
              <button
                onClick={handleDone}
                className={`text-sm font-semibold underline underline-offset-2 ${error ? 'text-status-red' : 'text-brand-black'}`}
              >
                {error ? 'Invalid' : 'Done'}
              </button>
            </>
          ) : (
            <>
              <span className="text-base font-medium text-brand-black">{displayValue}</span>
              <Pencil size={14} className="text-brand-muted" />
            </>
          )}
        </div>
      </div>
      {error && (
        <div className="pb-2">
          <span className="text-label text-status-red block text-right">{error}</span>
        </div>
      )}
    </div>
  );
};
