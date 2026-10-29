import { ChevronDown } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/ui';

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-expense" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn('field', className)} {...props} />;
}

/** Keeps digits and one decimal point with at most two decimals (paise). */
export const sanitizeAmount = (raw: string) => {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
};

interface MoneyInputProps extends Omit<ComponentProps<'input'>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
}

export function MoneyInput({ value, onChange, className, ...props }: MoneyInputProps) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[15px] text-muted">₹</span>
      <input
        inputMode="decimal"
        autoComplete="off"
        className={cn('field pl-8 tabular-nums', className)}
        value={value}
        onChange={(e) => onChange(sanitizeAmount(e.target.value))}
        {...props}
      />
    </div>
  );
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select className={cn('field appearance-none pr-10', className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
  /** Per-option class when selected, e.g. to colour Expense red */
  activeClass?: Partial<Record<T, string>>;
}

export function Segmented<T extends string>({ value, onChange, options, label, className, activeClass }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-xl bg-subtle p-1', className)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex-1 rounded-lg px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap transition',
              selected ? cn('bg-surface shadow-sm', activeClass?.[o.value] ?? 'text-ink') : 'text-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A bordered radio option that highlights when chosen: put a `choiceRadio` input and its text inside a label. */
export const choiceRow =
  'flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 transition has-[:checked]:border-primary has-[:checked]:bg-primary-soft/50';
export const choiceRadio = 'mt-0.5 size-4 shrink-0 accent-[var(--primary-fill)]';

/** Pill-shaped toggle chip used for quick filters and pickers. */
export function Chip({ selected, className, children, ...props }: ComponentProps<'button'> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition',
        selected ? 'border-primary bg-primary-soft text-primary-ink' : 'border-line bg-surface text-ink-2 hover:bg-subtle',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
