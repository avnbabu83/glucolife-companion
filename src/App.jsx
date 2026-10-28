import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { Navigate } from 'react-router-dom';
import { SessionProvider, useSession } from '@/api/session';
import { setEntityFields } from '@/api/client';
import entityFields from '@/api/entity-fields.json';
import DexcomCallback from '@/components/cgm/DexcomCallback';
import SignIn from '@/components/auth/SignIn';
import FitbitCallback from '@/components/auth/FitbitCallback';
import FirstRunGate from '@/components/auth/FirstRunGate';

// Typed columns per entity (generated from api/openapi.json); other fields go into `extra`.
setEntityFields(entityFields);

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { loading, user } = useSession();

  // Show loading spinner while the session is restored from the refresh cookie
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Not signed in: only the sign-in screen is reachable
  if (!user) {
    return (
      <Routes>
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="*" element={<Navigate to="/sign-in" replace />} />
      </Routes>
    );
  }

  // Render the main app (consent dialog, then profile setup on first run)
  return (
    <FirstRunGate>
    <Routes>
      <Route path="/sign-in" element={<Navigate to="/" replace />} />
      <Route path="/fitbit/callback" element={<FitbitCallback />} />
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      <Route path="/dexcom/callback" element={<DexcomCallback />} />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </FirstRunGate>
  );
};


function App() {

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </SessionProvider>
  )
}

export default App
