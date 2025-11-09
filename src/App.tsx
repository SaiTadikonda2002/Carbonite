import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Auth from './components/Auth';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Actions from './pages/Actions';
import Challenges from './pages/Challenges';
import GlobalImpact from './pages/GlobalImpact';
import Calculator from './pages/Calculator';
import Learn from './pages/Learn';
import Profile from './pages/Profile';

function AppContent() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'actions':
        return <Actions />;
      case 'challenges':
        return <Challenges />;
      case 'global':
        return <GlobalImpact />;
      case 'calculator':
        return <Calculator />;
      case 'learn':
        return <Learn />;
      case 'profile':
        return <Profile />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
