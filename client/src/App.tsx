import { Compass } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { EmptyState, Spinner } from './components/ui/primitives';
import { useAuth } from './hooks/useAuth';
import { UploadsProvider } from './hooks/useUploads';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { DrivePage } from './pages/DrivePage';
import { LandingPage } from './pages/LandingPage';
import { OverviewPage } from './pages/OverviewPage';

function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner label="Loading My Own Cloud" />
    </div>
  );
}

/** Only for signed-in users; otherwise redirect to login and come back afterwards. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <>{children}</>;
}

/** Only for signed-out users (login/register/landing). */
function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to="/drive" replace />;
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState icon={<Compass size={24} />} title="Page not found" description="The page you’re looking for doesn’t exist.">
        <Link to="/" className="text-sm font-medium text-accent hover:text-accent-hover">
          Go home
        </Link>
      </EmptyState>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<GuestOnly><LandingPage /></GuestOnly>} />
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
      <Route
        element={
          <RequireAuth>
            <UploadsProvider>
              <AppShell />
            </UploadsProvider>
          </RequireAuth>
        }
      >
        <Route path="/drive" element={<DrivePage />} />
        <Route path="/drive/folder/:folderId" element={<DrivePage />} />
        <Route path="/overview" element={<OverviewPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
