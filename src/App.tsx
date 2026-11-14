import React from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Dashboard from './views/Dashboard';
import BookDetail from './views/BookDetail';
import Clubs from './views/Clubs';
import Library from './views/Library';
import ExchangeChat from './views/ExchangeChat';
import Register from './views/Register';
import Profile from './views/Profile';
import Subscription from './views/Subscription';
import SubscriptionSuccess from './views/SubscriptionSuccess';
import AdminPanel from './views/AdminPanel';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AddBook from './views/AddBook';
import Landing from './views/Landing';
import SetupProfile from './views/SetupProfile';
import Maintenance from './views/Maintenance';
import { useIsTeacher } from './lib/useRole';

const TeacherPanel = __SCHOOL__ ? React.lazy(() => import('./views/TeacherPanel')) : null;

// Demonstração: HashRouter (funciona em pasta estática) e seletor de aluno.
const Router: any = __DEMO__ ? HashRouter : BrowserRouter;
const DemoSwitcher = __DEMO__ ? React.lazy(() => import('./demo/DemoSwitcher')) : null;

// Escola (demonstração): a professora entra no painel; os alunos, na própria estante.
function SchoolHome() {
  const { user, loading } = useAuth();
  const { isTeacher, loading: roleLoading } = useIsTeacher();
  if (loading || roleLoading) return null;
  if (!user) return <Navigate to="/register" replace />;
  return <Navigate to={isTeacher ? '/professor' : '/dashboard'} replace />;
}

// Mude para false para desativar o modo de manutenção
const MAINTENANCE_MODE = false;

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, needsProfileSetup, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="min-h-screen bg-[#fefccf] flex items-center justify-center font-headline-md text-primary">Carregando a Magia...</div>;
  }

  if (!user) {
    return <Navigate to="/register" replace />;
  }

  if (needsProfileSetup && location.pathname !== '/setup-profile') {
    return <Navigate to="/setup-profile" replace />;
  }

  return children;
}

export default function App() {
  if (MAINTENANCE_MODE) {
    return <Maintenance />;
  }

  return (
    <AuthProvider>
      <Router basename={__DEMO__ ? undefined : import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/" element={__SCHOOL__ ? <SchoolHome /> : __DEMO__ ? <Navigate to="/dashboard" replace /> : <Landing />} />
          {TeacherPanel && <Route path="/professor" element={<ProtectedRoute><React.Suspense fallback={null}><TeacherPanel /></React.Suspense></ProtectedRoute>} />}
          <Route path="/register" element={<Register />} />
          <Route path="/setup-profile" element={<ProtectedRoute><SetupProfile /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/book/:id" element={<ProtectedRoute><BookDetail /></ProtectedRoute>} />
          <Route path="/clubs" element={<ProtectedRoute><Clubs /></ProtectedRoute>} />
          <Route path="/library" element={<ProtectedRoute><Library /></ProtectedRoute>} />
          <Route path="/add-book" element={<ProtectedRoute><AddBook /></ProtectedRoute>} />
          <Route path="/chat" element={<ProtectedRoute><ExchangeChat /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><AdminPanel /></ProtectedRoute>} />
          <Route path="/subscription" element={<ProtectedRoute><Subscription /></ProtectedRoute>} />
          <Route path="/subscription-success" element={<ProtectedRoute><SubscriptionSuccess /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
      {DemoSwitcher && <React.Suspense fallback={null}><DemoSwitcher /></React.Suspense>}
    </AuthProvider>
  );
}