import { ArrowRight, FolderTree, Gauge, Lock, Search, Upload, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { Logo } from '../components/ui/primitives';

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Upload, title: 'Effortless uploads', text: 'Drag files in from your desktop and watch each one upload with live progress.' },
  { icon: FolderTree, title: 'Real folders', text: 'Nest folders, rename and move anything, and always know where you are.' },
  { icon: Search, title: 'Find it fast', text: 'Search every folder at once and sort by name, size or date.' },
  { icon: Gauge, title: 'Clear storage insight', text: 'See exactly what takes up space, broken down by file type.' },
  { icon: Lock, title: 'Private by design', text: 'Files are never public. Every download is checked against your session.' },
];

export function LandingPage() {
  useEffect(() => {
    document.title = 'My Own Cloud — personal cloud storage';
  }, []);

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-2" aria-label="Account">
          <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-fg-muted hover:text-fg">
            Sign in
          </Link>
          <Link
            to="/register"
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg shadow-sm hover:bg-accent-hover"
          >
            Get started
          </Link>
        </nav>
      </header>

      <main>
        <section className="relative mx-auto max-w-6xl px-5 pt-16 pb-20 text-center sm:px-8 sm:pt-24">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-80 max-w-3xl opacity-50 blur-3xl"
            style={{ background: 'radial-gradient(ellipse at center, var(--accent) 0%, transparent 70%)' }}
          />
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-fg-muted shadow-card">
            <span className="size-1.5 rounded-full bg-success" aria-hidden="true" /> Self-hosted · PostgreSQL · Open architecture
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-6xl">
            A calm, private home for your files.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-fg-muted text-balance sm:text-lg">
            My Own Cloud keeps your documents, photos and projects organised — on a backend and database you run yourself.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link
              to="/register"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-[15px] font-medium text-accent-fg shadow-sm hover:bg-accent-hover"
            >
              Create your cloud <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link
              to="/login"
              className="inline-flex h-11 items-center rounded-xl border border-line bg-surface px-5 text-[15px] font-medium shadow-card hover:bg-surface-2"
            >
              Sign in
            </Link>
          </div>
        </section>

        <section aria-label="Features" className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
                <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <h2 className="mt-4 text-sm font-semibold">{title}</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{text}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-fg-subtle">
        My Own Cloud — a portfolio project. React · Express · PostgreSQL.
      </footer>
    </div>
  );
}
