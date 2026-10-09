import { useEffect } from 'react';
import { ArrowUpRight, Loader2, X } from 'lucide-react';
import { clsx } from 'clsx';

export const cn = (...a) => clsx(...a);

export function PageHeader({ title, subtitle, actions, className }) {
  return (
    <div className={cn('mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4', className)}>
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-xs sm:text-sm text-slate-500 font-normal">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

export const Card = ({ className, children, ...rest }) => (
  <div
    {...rest}
    className={cn(
      'rounded-xl sm:rounded-2xl border border-slate-100 bg-white p-5 sm:p-6 shadow-sm transition-all duration-200',
      className
    )}
  >
    {children}
  </div>
);

/** MetricCard matching OyeChotuu Food Panel AdminHome.jsx */
export function MetricCard({ title, value, helper, icon, accent = 'bg-blue-200/40', path, onClick, className }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 active:scale-[0.98] h-full min-h-[110px]',
        (path || onClick) && 'cursor-pointer',
        className
      )}
    >
      {/* Soft color tint background */}
      <div className={cn('absolute inset-0 opacity-30 transition-opacity duration-300 group-hover:opacity-55 pointer-events-none', accent)} />

      {/* Card Content with equal layout */}
      <div className="relative z-10 flex items-start justify-between gap-3 h-full">
        <div className="flex-1 min-w-0 pr-1 flex flex-col justify-between h-full">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500 mb-1 truncate">{title}</p>
            <p className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 leading-tight mb-1">{value}</p>
          </div>
          {helper && <p className="text-[11px] font-medium text-neutral-500 line-clamp-1 mt-1">{helper}</p>}
        </div>

        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/95 ring-1 ring-neutral-200/80 shadow-xs transition-all duration-300 group-hover:scale-110 group-hover:rotate-6 group-hover:shadow-md">
          {icon}
        </div>
      </div>

      {/* Floating arrow on hover */}
      <div className="absolute bottom-2.5 right-2.5 z-10 opacity-0 transform translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0">
        <ArrowUpRight className="h-3.5 w-3.5 text-neutral-400 group-hover:text-neutral-700" />
      </div>
    </div>
  );
}

/** StatCard with colorful icon badge matching OyeChotuu dashboard ds-stat-card */
export const StatCard = ({
  label,
  value,
  icon: Icon,
  color = 'text-blue-600',
  bg = 'bg-blue-50',
  description,
  trend,
  trendDirection = 'up',
  onClick,
  className,
}) => (
  <div
    onClick={onClick}
    className={cn(
      'group relative flex flex-col justify-between rounded-xl sm:rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-slate-200 h-full',
      onClick && 'cursor-pointer',
      className
    )}
  >
    <div className="flex items-center justify-between gap-3 mb-3">
      <div className={cn('flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105 shadow-2xs', bg, color)}>
        {Icon && <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.2} />}
      </div>
      {trend && (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
            trendDirection === 'up' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' : 'bg-rose-50 text-rose-700 border border-rose-200/60'
          )}
        >
          {trend}
        </span>
      )}
    </div>
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      {description && <p className="mt-1 text-xs text-slate-400 line-clamp-1">{description}</p>}
    </div>
  </div>
);

export const Button = ({ variant = 'primary', loading, className, children, ...rest }) => (
  <button
    {...rest}
    disabled={rest.disabled || loading}
    className={cn(
      'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 shadow-2xs active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
      variant === 'primary' && 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm hover:shadow',
      variant === 'brand' && 'text-white hover:opacity-90 shadow-sm',
      variant === 'outline' && 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300',
      variant === 'danger' && 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
      variant === 'ghost' && 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 shadow-none',
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
    {label && <span className="mb-1.5 block text-xs sm:text-sm font-semibold text-slate-700">{label}</span>}
    {children}
    {hint && !error && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    {error && <span className="mt-1 block text-xs text-rose-600 font-medium">{error}</span>}
  </label>
);

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-2xs outline-none transition duration-200 placeholder:text-slate-400 focus:border-slate-800 focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50 disabled:text-slate-400';

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
      <div className="text-sm font-semibold text-slate-900">{label}</div>
      {description && <div className="text-xs text-slate-500">{description}</div>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50', checked ? 'bg-emerald-500' : 'bg-slate-300')}
    >
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
    </button>
  </div>
);

export const Badge = ({ tone = 'neutral', children }) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
      tone === 'green' && 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
      tone === 'red' && 'bg-rose-50 text-rose-700 border border-rose-200/60',
      tone === 'amber' && 'bg-amber-50 text-amber-800 border border-amber-200/60',
      tone === 'blue' && 'bg-blue-50 text-blue-700 border border-blue-200/60',
      tone === 'neutral' && 'bg-slate-100 text-slate-700 border border-slate-200/60'
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className={cn('max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-100', wide ? 'max-w-3xl' : 'max-w-lg')}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base sm:text-lg font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
        {footer && <div className="flex justify-end gap-2.5 border-t border-slate-100 bg-slate-50/50 px-6 py-4 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

export const Spinner = () => (
  <div className="flex items-center justify-center py-16 text-slate-400">
    <Loader2 className="h-6 w-6 animate-spin text-slate-600" />
  </div>
);

export const ErrorBox = ({ message, onRetry }) => (
  <div className="rounded-2xl border border-rose-200/70 bg-rose-50 p-4 sm:p-5 text-sm text-rose-700 shadow-2xs">
    <div className="whitespace-pre-line font-medium">{message}</div>
    {onRetry && (
      <button onClick={onRetry} className="mt-2.5 font-semibold text-rose-800 hover:underline">
        Retry
      </button>
    )}
  </div>
);

/** Simple data table. columns: [{ key, header, render?(row), className? }] */
export function DataTable({ columns, rows, empty = 'No records', onRowClick }) {
  return (
    <div className="overflow-x-auto rounded-xl sm:rounded-2xl border border-slate-100 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-100 bg-slate-50/75 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={cn('px-4 py-3.5', c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-400">
                {empty}
              </td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr
              key={row.id || row._id || i}
              onClick={() => onRowClick?.(row)}
              className={cn('transition-colors duration-150', onRowClick && 'cursor-pointer hover:bg-slate-50/80')}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn('px-4 py-3.5 align-middle text-slate-700', c.className)}>
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

/** Page controls matching OyeChotuu Food Panel OrdersTable.jsx. */
export function Pagination({ meta, onPage, onLimit, limits = [10, 20, 50] }) {
  if (!meta || (meta.pages <= 1 && !onLimit && meta.total <= 10)) return null;
  const currentPage = meta.page || 1;
  const totalPages = Math.max(1, meta.pages || 1);
  const totalItems = meta.total || 0;
  const limit = meta.limit || 20;
  const from = totalItems ? (currentPage - 1) * limit + 1 : 0;
  const to = Math.min(currentPage * limit, totalItems);

  // Generate visible page numbers (up to 5 buttons) matching OyeChotuu food panel
  const pageNumbers = [];
  const maxButtons = Math.min(5, totalPages);
  for (let i = 0; i < maxButtons; i++) {
    let pageNum;
    if (totalPages <= 5) {
      pageNum = i + 1;
    } else if (currentPage <= 3) {
      pageNum = i + 1;
    } else if (currentPage >= totalPages - 2) {
      pageNum = totalPages - 4 + i;
    } else {
      pageNum = currentPage - 2 + i;
    }
    if (pageNum > 0 && pageNum <= totalPages) {
      pageNumbers.push(pageNum);
    }
  }

  return (
    <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3.5 rounded-xl sm:rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 sm:px-6 py-3.5 text-xs sm:text-sm text-slate-600 shadow-2xs">
      <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
        {onLimit && (
          <label className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-600">
            Rows
            <select
              value={limit}
              onChange={(e) => onLimit(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
            >
              {limits.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="text-slate-500 text-xs sm:text-sm">
          Showing <span className="font-semibold text-slate-900">{from}</span> to{' '}
          <span className="font-semibold text-slate-900">{to}</span> of{' '}
          <span className="font-semibold text-slate-900">{totalItems}</span> items
        </span>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={() => onPage(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="rounded-lg border border-slate-300/80 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 shadow-2xs transition-all hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>

        <div className="flex items-center gap-1">
          {pageNumbers.map((num) => (
            <button
              key={num}
              onClick={() => onPage(num)}
              className={cn(
                'min-w-8 h-8 rounded-lg px-2.5 py-1 text-xs sm:text-sm font-semibold transition-all duration-200 shadow-2xs',
                currentPage === num
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'border border-slate-300/80 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400'
              )}
            >
              {num}
            </button>
          ))}
        </div>

        <button
          onClick={() => onPage(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className="rounded-lg border border-slate-300/80 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 shadow-2xs transition-all hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

