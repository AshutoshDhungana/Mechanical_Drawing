import { useState } from 'react'

interface InputProps {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  /** Display multiplier, e.g. 1000 to show metres as millimetres. */
  scale?: number
  className?: string
  label?: string // aria-label when there is no visible label
}

/** Keeps the raw text while typing ("7.", "-") and only reports finite numbers within [min, max]. */
export function NumInput({ value, onChange, step, min, max, scale = 1, className, label }: InputProps) {
  const show = (v: number) => String(+(v * scale).toFixed(10)) // 2.8 + 0.1 shows as 2.9
  const [text, setText] = useState(() => show(value))
  const [shown, setShown] = useState(value)
  if (value !== shown) { // changed from outside (e.g. a linked default): show it unless it's what was typed
    setShown(value)
    if (Number(text) / scale !== value) setText(show(value))
  }
  const ok = (s: string) => {
    const v = Number(s) / scale
    return s.trim() !== '' && Number.isFinite(v) && (min === undefined || v >= min) && (max === undefined || v <= max)
  }
  return (
    <input type="number" inputMode="decimal" step={step ?? 'any'} value={text} aria-invalid={!ok(text)}
      aria-label={label} className={className}
      onChange={(e) => {
        setText(e.target.value)
        if (ok(e.target.value)) onChange(Number(e.target.value) / scale)
      }} />
  )
}

interface Props extends Omit<InputProps, 'className' | 'label'> {
  label: string
  unit?: string
  /** When set, the field is linked to a value derived elsewhere; typing overrides it. */
  linked?: boolean
  onRelink?: () => void
  hint?: string
}

export function NumberField({ label, unit, linked, onRelink, hint, ...input }: Props) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className="field-input">
        <NumInput {...input} className={linked ? 'linked' : undefined} />
        <span className="unit">{unit}</span>
        {onRelink && (
          <button type="button" className="relink" disabled={linked} onClick={onRelink}
            title={linked ? 'Linked to project inputs' : 'Reset to the value derived from project inputs'}>
            {linked ? 'auto' : 'reset'}
          </button>
        )}
      </span>
    </label>
  )
}

export function SelectField<T extends string>({ label, value, options, onChange, hint }: {
  label: string; value: T; options: readonly T[]; onChange: (v: T) => void; hint?: string
}) {
  return (
    <label className="field">
      <span className="field-label">{label}{hint && <small>{hint}</small>}</span>
      <span className="field-input">
        <select value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </span>
    </label>
  )
}
