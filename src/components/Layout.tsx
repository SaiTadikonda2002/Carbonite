import { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, User, Home, Zap, Trophy, Globe, BookOpen, TrendingUp } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

export default function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const { profile, signOut } = useAuth();

  const navigation = [
    { name: 'Dashboard', icon: Home, page: 'dashboard' },
    { name: 'Actions', icon: Zap, page: 'actions' },
    { name: 'Challenges', icon: Trophy, page: 'challenges' },
    { name: 'Global', icon: Globe, page: 'global' },
    { name: 'Calculator', icon: TrendingUp, page: 'calculator' },
    { name: 'Learn', icon: BookOpen, page: 'learn' },
    { name: 'Profile', icon: User, page: 'profile' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
      <nav className="bg-white border-b border-emerald-100 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <div className="flex items-center space-x-2">
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-2 rounded-lg">
                  <Globe className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  Climate Action
                </span>
              </div>

              <div className="hidden md:flex space-x-1">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.page;
                  return (
                    <button
                      key={item.name}
                      onClick={() => onNavigate(item.page)}
                      className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
                        isActive
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md'
                          : 'text-gray-600 hover:bg-emerald-50 hover:text-emerald-600'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-sm font-medium">{item.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {profile && (
                <div className="hidden sm:flex items-center space-x-3 px-4 py-2.5 bg-white rounded-lg border border-emerald-200 shadow-sm hover:shadow-md transition-all">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-900 leading-tight">
                      {profile.full_name || 'User'}
                    </span>
                    <div className="flex items-center space-x-1.5 text-xs">
                      <span className="text-emerald-600 font-medium">
                        Level {profile.level}
                      </span>
                      <span className="text-gray-300">•</span>
                      <span className="text-teal-600 font-medium">
                        {profile.total_points.toLocaleString()} pts
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={() => signOut()}
                className="flex items-center space-x-2 px-4 py-2.5 bg-white text-gray-700 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-teal-50 hover:text-emerald-700 rounded-lg border border-emerald-200 shadow-sm hover:shadow-md transition-all"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-medium hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-emerald-100 shadow-lg pb-safe">
        <div className="grid grid-cols-6 gap-1 p-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.page;
            return (
              <button
                key={item.name}
                onClick={() => onNavigate(item.page)}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white'
                    : 'text-gray-600 hover:bg-emerald-50'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs mt-1 font-medium">{item.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
