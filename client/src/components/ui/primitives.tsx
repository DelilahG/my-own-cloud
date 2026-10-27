import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover shadow-sm',
  secondary: 'bg-surface text-fg border border-line hover:bg-surface-2 hover:border-line-strong shadow-card',
  ghost: 'text-fg-muted hover:text-fg hover:bg-surface-2',
  danger: 'bg-danger text-white hover:bg-danger-hover shadow-sm',
};
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors select-none',
        'disabled:pointer-events-none disabled:opacity-55',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : icon}
      {children}
    </button>
  );
});

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm' | 'md' }
>(function IconButton({ label, size = 'md', className, children, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-lg text-fg-muted transition-colors',
        'hover:bg-surface-2 hover:text-fg disabled:opacity-50',
        size === 'sm' ? 'size-8' : 'size-9',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={clsx(
          'h-10 w-full rounded-lg border bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle transition-colors',
          'focus:outline-none focus-visible:outline-none focus:ring-4 focus:ring-accent/15',
          invalid ? 'border-danger focus:border-danger' : 'border-line hover:border-line-strong focus:border-accent',
          className,
        )}
        {...rest}
      />
    );
  },
);

/** Label + control + hint/error, wired up with ids for screen readers. */
export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string | null;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-fg">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className={clsx('inline-flex items-center text-fg-subtle', className)}>
      <Loader2 className="animate-spin" size={20} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <defs>
          <linearGradient id="moc-logo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8a7ef9" />
            <stop offset="1" stopColor="#4c3de0" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#moc-logo)" />
        <path d="M10.5 22h11a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 10.6 14.1 4 4 0 0 0 10.5 22Z" fill="#fff" />
      </svg>
      {!compact && <span className="text-[15px] font-semibold tracking-tight text-fg">My Own Cloud</span>}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center animate-fade">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-line bg-surface text-fg-subtle shadow-card">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-fg-muted">{description}</p>}
      {children && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}
