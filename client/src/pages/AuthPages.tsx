import { Eye, EyeOff, Lock, ShieldCheck, Zap } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, Field, Input, Logo } from '../components/ui/primitives';
import { useAuth } from '../hooks/useAuth';
import { ApiError, errorMessage } from '../lib/api';

/** Only allow redirects to paths inside this app (prevents open redirects). */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/drive';
}

function AuthLayout({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden overflow-hidden bg-[#0f0d24] p-12 text-white lg:flex lg:flex-col">
        <div
          aria-hidden="true"
          className="absolute -top-40 -right-40 size-[34rem] rounded-full opacity-60 blur-3xl"
          style={{ background: 'radial-gradient(circle, #6c5cf5 0%, transparent 65%)' }}
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-48 -left-24 size-[28rem] rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, #3e7bfa 0%, transparent 65%)' }}
        />
        <Link to="/" className="relative">
          <span className="inline-flex items-center gap-2.5 text-[15px] font-semibold">
            <Logo compact /> My Own Cloud
          </span>
        </Link>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">Your files, on infrastructure you control.</h2>
          <ul className="mt-8 space-y-4 text-[15px] text-white/75">
            <li className="flex gap-3">
              <Lock size={18} className="mt-0.5 shrink-0 text-[#a99ffb]" aria-hidden="true" /> Private storage — files are only
              reachable through your authenticated session.
            </li>
            <li className="flex gap-3">
              <Zap size={18} className="mt-0.5 shrink-0 text-[#a99ffb]" aria-hidden="true" /> Drag-and-drop uploads with live
              progress, folders, search and sorting.
            </li>
            <li className="flex gap-3">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#a99ffb]" aria-hidden="true" /> Hashed passwords,
              HttpOnly sessions and strict per-user access checks.
            </li>
          </ul>
        </div>
      </aside>
      <main className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm animate-fade">
          <Link to="/" className="mb-10 inline-block lg:hidden">
            <Logo />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className="pr-10" />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle hover:text-fg"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
      {message}
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Sign in · My Own Cloud';
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle={
        <>
          New here?{' '}
          <Link to="/register" className="font-medium text-accent hover:text-accent-hover">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field id="email" label="Email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>
        <Field id="password" label="Password">
          <PasswordInput
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

function passwordProblem(password: string, email: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return 'Include at least one letter and one number.';
  if (new TextEncoder().encode(password).length > 72) return 'Password is too long (max 72 bytes).';
  if (password.toLowerCase() === email.trim().toLowerCase()) return 'Password must differ from your email.';
  return null;
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Create account · My Own Cloud';
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!displayName.trim()) errors.displayName = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.';
    const pw = passwordProblem(password, email);
    if (pw) errors.password = pw;
    setFieldErrors(errors);
    setError(null);
    if (Object.keys(errors).length) return;

    setBusy(true);
    try {
      await register({ displayName: displayName.trim(), email: email.trim(), password });
      navigate('/drive', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setFieldErrors({ email: err.message });
      else setError(errorMessage(err));
      setBusy(false);
    }
  };

  const strength = password ? (passwordProblem(password, email) ? 1 : password.length >= 12 ? 3 : 2) : 0;

  return (
    <AuthLayout
      title="Create your cloud"
      subtitle={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent hover:text-accent-hover">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field id="displayName" label="Name" error={fieldErrors.displayName}>
          <Input
            id="displayName"
            autoComplete="name"
            autoFocus
            maxLength={80}
            value={displayName}
            invalid={!!fieldErrors.displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </Field>
        <Field id="email" label="Email" error={fieldErrors.email}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            invalid={!!fieldErrors.email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>
        <Field id="password" label="Password" error={fieldErrors.password} hint="At least 8 characters, with a letter and a number.">
          <PasswordInput
            id="password"
            autoComplete="new-password"
            value={password}
            invalid={!!fieldErrors.password}
            aria-describedby={fieldErrors.password ? 'password-error' : 'password-hint'}
            onChange={(e) => setPassword(e.target.value)}
          />
          {password && (
            <div className="flex gap-1 pt-0.5" aria-hidden="true">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    n <= strength ? (strength === 1 ? 'bg-danger' : strength === 2 ? 'bg-warning' : 'bg-success') : 'bg-surface-3'
                  }`}
                />
              ))}
            </div>
          )}
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
