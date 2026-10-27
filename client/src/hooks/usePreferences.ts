import { useCallback, useState } from 'react';
import type { SortField, SortOrder } from '../lib/types';

export interface ViewPreferences {
  view: 'grid' | 'list';
  sort: SortField;
  order: SortOrder;
}

const KEY = 'moc-view';
const DEFAULTS: ViewPreferences = { view: 'grid', sort: 'name', order: 'asc' };

function read(): ViewPreferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<ViewPreferences>;
    return {
      view: parsed.view === 'list' ? 'list' : 'grid',
      sort: (['name', 'size', 'updated', 'created'] as const).includes(parsed.sort!) ? parsed.sort! : 'name',
      order: parsed.order === 'desc' ? 'desc' : 'asc',
    };
  } catch {
    return DEFAULTS;
  }
}

/** Grid/list view and sort order, remembered in this browser (UI convenience only). */
export function usePreferences() {
  const [prefs, setPrefs] = useState<ViewPreferences>(read);
  const update = useCallback((changes: Partial<ViewPreferences>) => {
    setPrefs((current) => {
      const next = { ...current, ...changes };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  return [prefs, update] as const;
}
