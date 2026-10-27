import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { HardDrive } from 'lucide-react';
import { Link } from 'react-router';
import { formatBytes, percent, percentLabel } from '../../lib/format';
import { storageQuery } from '../../hooks/useUploads';

/** Compact used/quota meter shown in the sidebar on every page. */
export function StorageMeter({ onNavigate }: { onNavigate?: () => void }) {
  const { data, isPending, isError } = useQuery(storageQuery);

  if (isPending) {
    return (
      <div className="space-y-2.5 rounded-xl border border-line bg-surface p-3.5" aria-hidden="true">
        <div className="skeleton h-3.5 w-20" />
        <div className="skeleton h-1.5 w-full" />
        <div className="skeleton h-3 w-28" />
      </div>
    );
  }
  if (isError || !data) return null;

  const pct = percent(data.usedBytes, data.quotaBytes);
  const tone = pct >= 95 ? 'bg-danger' : pct >= 80 ? 'bg-warning' : 'bg-accent';

  return (
    <Link
      to="/overview"
      onClick={onNavigate}
      className="block rounded-xl border border-line bg-surface p-3.5 shadow-card transition-colors hover:border-line-strong"
    >
      <div className="flex items-center gap-2 text-[13px] font-medium text-fg">
        <HardDrive size={15} className="text-fg-muted" aria-hidden="true" />
        Storage
        <span className="ml-auto text-xs font-normal text-fg-subtle">{percentLabel(data.usedBytes, data.quotaBytes)}%</span>
      </div>
      <div
        className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-3"
        role="meter"
        aria-label="Storage used"
        aria-valuemin={0}
        aria-valuemax={data.quotaBytes}
        aria-valuenow={data.usedBytes}
        aria-valuetext={`${formatBytes(data.usedBytes)} of ${formatBytes(data.quotaBytes)} used`}
      >
        <div className={clsx('h-full rounded-full transition-[width] duration-500', tone)} style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }} />
      </div>
      <p className="mt-2 text-xs text-fg-muted">
        {formatBytes(data.usedBytes)} of {formatBytes(data.quotaBytes)} used
      </p>
    </Link>
  );
}
