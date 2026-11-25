import React, { useId } from 'react';

function FieldWrapper({ id, label, required, hint, error, className = '', children }) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={`form-field ${error ? 'form-field-invalid' : ''} ${className}`.trim()}>
      {label && (
        <label htmlFor={id}>
          {label}
          {required && <span className="required-mark" aria-hidden="true"> *</span>}
        </label>
      )}
      {children({
        id,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
      })}
      {hint && !error && (
        <span id={hintId} className="field-hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function TextField({
  id,
  label,
  required = false,
  hint,
  error,
  className = '',
  ...inputProps
}) {
  const autoId = useId();
  const fieldId = id || autoId;

  return (
    <FieldWrapper
      id={fieldId}
      label={label}
      required={required}
      hint={hint}
      error={error}
      className={className}
    >
      {(a11y) => <input required={required} {...a11y} {...inputProps} />}
    </FieldWrapper>
  );
}

export function SelectField({
  id,
  label,
  required = false,
  hint,
  error,
  options = [],
  placeholder,
  className = '',
  children,
  ...selectProps
}) {
  const autoId = useId();
  const fieldId = id || autoId;

  return (
    <FieldWrapper
      id={fieldId}
      label={label}
      required={required}
      hint={hint}
      error={error}
      className={className}
    >
      {(a11y) => (
        <select required={required} {...a11y} {...selectProps}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
          {children}
        </select>
      )}
    </FieldWrapper>
  );
}

export function TextareaField({
  id,
  label,
  required = false,
  hint,
  error,
  rows = 3,
  className = '',
  ...textareaProps
}) {
  const autoId = useId();
  const fieldId = id || autoId;

  return (
    <FieldWrapper
      id={fieldId}
      label={label}
      required={required}
      hint={hint}
      error={error}
      className={className}
    >
      {(a11y) => <textarea rows={rows} required={required} {...a11y} {...textareaProps} />}
    </FieldWrapper>
  );
}
