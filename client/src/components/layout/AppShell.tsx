import clsx from 'clsx';
import { FolderOpen, LayoutDashboard, Menu, Search, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import { IconButton, Logo } from '../ui/primitives';
import { AccountMenu } from './AccountMenu';
import { StorageMeter } from './StorageMeter';
import { UploadPanel } from './UploadPanel';

const NAV = [
  { to: '/drive', label: 'My Cloud', icon: FolderOpen },
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 px-4 py-5">
      <Link to="/drive" onClick={onNavigate} className="px-2" aria-label="My Own Cloud home">
        <Logo />
      </Link>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
              )
            }
          >
            <Icon size={18} strokeWidth={1.85} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto">
        <StorageMeter onNavigate={onNavigate} />
      </div>
    </div>
  );
}

function SearchBox() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const location = useLocation();
  const current = location.pathname.startsWith('/drive') ? (params.get('q') ?? '') : '';
  const [value, setValue] = useState(current);

  // Keep the box in sync when the URL changes (e.g. clearing the search).
  useEffect(() => setValue(current), [current]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    navigate(q ? `/drive?q=${encodeURIComponent(q)}` : '/drive');
  };

  return (
    <form role="search" onSubmit={submit} className="relative w-full max-w-md">
      <label htmlFor="global-search" className="sr-only">
        Search files and folders
      </label>
      <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
      <input
        id="global-search"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search your cloud"
        maxLength={100}
        autoComplete="off"
        className="h-9 w-full rounded-lg border border-line bg-surface-2 pr-3 pl-9 text-sm placeholder:text-fg-subtle transition-colors hover:border-line-strong focus:border-accent focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/15 focus-visible:outline-none"
      />
    </form>
  );
}

/** Signed-in layout: sidebar (drawer on mobile), top bar, page content, upload panel. */
export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <div className="min-h-dvh lg:pl-64">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-canvas lg:block">
        <Sidebar />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40 animate-fade" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-canvas shadow-pop animate-in">
            <IconButton label="Close navigation" className="absolute top-4 right-3" onClick={() => setDrawerOpen(false)}>
              <X size={18} />
            </IconButton>
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-md sm:px-6">
        <IconButton label="Open navigation" className="lg:hidden" onClick={() => setDrawerOpen(true)}>
          <Menu size={20} />
        </IconButton>
        <SearchBox />
        <div className="ml-auto">
          <AccountMenu />
        </div>
      </header>

      <main id="main" className="px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>

      <UploadPanel />
    </div>
  );
}
