import { useEffect } from 'react';
import { Loader2, X } from 'lucide-react';
import { clsx } from 'clsx';

export const cn = (...a) => clsx(...a);

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export const Card = ({ className, children }) => (
  <div className={cn('rounded-xl border border-neutral-200 bg-white p-5 shadow-sm', className)}>{children}</div>
);

export const Button = ({ variant = 'primary', loading, className, children, ...rest }) => (
  <button
    {...rest}
    disabled={rest.disabled || loading}
    className={cn(
      'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
      variant === 'primary' && 'bg-neutral-900 text-white hover:bg-neutral-700',
      variant === 'brand' && 'text-white hover:opacity-90',
      variant === 'outline' && 'border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50',
      variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
      className
    )}
    style={variant === 'brand' ? { backgroundColor: 'var(--brand)' } : undefined}
  >
    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
    {children}
  </button>
);

export const Field = ({ label, hint, error, children }) => (
  <label className="block">
    {label && <span className="mb-1 block text-sm font-medium text-neutral-700">{label}</span>}
    {children}
    {hint && !error && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
  </label>
);

const inputCls =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:bg-neutral-100';

export const Input = (props) => <input {...props} className={cn(inputCls, props.className)} />;
export const Textarea = (props) => <textarea rows={3} {...props} className={cn(inputCls, props.className)} />;
export const Select = ({ children, ...props }) => (
  <select {...props} className={cn(inputCls, props.className)}>
    {children}
  </select>
);

export const Switch = ({ checked, onChange, label, description, disabled }) => (
  <div className="flex items-start justify-between gap-4 py-2">
    <div>
      <div className="text-sm font-medium text-neutral-900">{label}</div>
      {description && <div className="text-xs text-neutral-500">{description}</div>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50', checked ? 'bg-emerald-500' : 'bg-neutral-300')}
    >
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
    </button>
  </div>
);

export const Badge = ({ tone = 'neutral', children }) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
      tone === 'green' && 'bg-emerald-100 text-emerald-700',
      tone === 'red' && 'bg-red-100 text-red-700',
      tone === 'amber' && 'bg-amber-100 text-amber-800',
      tone === 'blue' && 'bg-blue-100 text-blue-700',
      tone === 'neutral' && 'bg-neutral-100 text-neutral-700'
    )}
  >
    {children}
  </span>
);

export function Modal({ open, title, onClose, children, footer, wide }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className={cn('max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white shadow-xl', wide ? 'max-w-3xl' : 'max-w-lg')}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-neutral-500 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export const Spinner = () => (
  <div className="flex items-center justify-center py-16 text-neutral-400">
    <Loader2 className="h-6 w-6 animate-spin" />
  </div>
);

export const ErrorBox = ({ message, onRetry }) => (
  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
    <div className="whitespace-pre-line">{message}</div>
    {onRetry && (
      <button onClick={onRetry} className="mt-2 font-semibold underline">
        Retry
      </button>
    )}
  </div>
);

/** Simple data table. columns: [{ key, header, render?(row), className? }] */
export function DataTable({ columns, rows, empty = 'No records', onRowClick }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={cn('px-4 py-3 font-semibold', c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-neutral-500">
                {empty}
              </td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr key={row.id || row._id || i} onClick={() => onRowClick?.(row)} className={cn(onRowClick && 'cursor-pointer hover:bg-neutral-50')}>
              {columns.map((c) => (
                <td key={c.key} className={cn('px-4 py-3 align-middle', c.className)}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.pages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-neutral-600">
      <span>
        Page {meta.page} of {meta.pages} · {meta.total} total
      </span>
      <div className="flex gap-2">
        <Button variant="outline" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
          Previous
        </Button>
        <Button variant="outline" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
