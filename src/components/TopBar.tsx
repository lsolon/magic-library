import { Sparkles, LogOut, Compass, BookOpen, Package, User, MessageSquare, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

export function TopBar(props: any) {
  const { user, userAvatar, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { path: '/dashboard', icon: Compass, label: 'Mapa' },
    { path: '/library', icon: BookOpen, label: 'Livros' },
    { path: '/clubs', icon: Package, label: 'Grupos' },
    { path: '/chat', icon: MessageSquare, label: 'Chat' },
    { path: '/profile', icon: User, label: 'Perfil' },
  ];

  return (
    <header className="w-full top-0 sticky bg-background/80 backdrop-blur-md shadow-[0_8px_30px_rgb(12,103,128,0.1)] z-40 transition-all duration-300 ease-out">
      <div className="flex justify-between items-center px-4 py-4 w-full max-w-[1200px] mx-auto">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/profile')} 
            className="w-12 h-12 rounded-full overflow-hidden border-2 border-primary-container shadow-md block hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer bg-primary-container shrink-0"
            title="Ver Perfil"
          >
            <img 
              src={userAvatar || user?.photoURL || "https://lh3.googleusercontent.com/aida-public/AB6AXuAUJCngM7oHNkoGOxzFhtzVP7wYWVkxagVebNeGo7h2Ol3PwgoxynlwSbIjMzruGFF_GA-7VeBIS3-nyG5bSOPKU4McJXMPCPZeYAVoxSP89e5piLtUxp-g9gfpdzM5jDvaZSn-Pz7rhpCrYiK4sYTw41qrfJSw14QzgxCXJ_0K9BNK1KdDBvYQu53OSauLxjV94xOsjcxHH6d8pikkg82015XPv42adeq8IU6AtI5RsuYi2QUfQDYMpsk7zLKCbRFeOBUWdOE2569w"}
              alt="Avatar" 
              className="w-full h-full object-cover" 
              referrerPolicy="no-referrer"
            />
          </button>
          <Link to="/dashboard" className="flex items-center gap-3 cursor-pointer hover:scale-105 transition-transform">
            <h1 className="font-headline-lg-mobile text-primary drop-shadow-sm flex items-center gap-2 whitespace-nowrap">
              <img 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDva-qK4dyshafW3iHriK_oaoWDV0E5SDZxy3pRs9l10h-O-HsKPwBuNWz4Prq3eOOaSdnkLKpNrmXPhgq97ixztTflLeRNdKbmsb26CcgaTduzvAetWhhndOzY_Lzi4kE-YnxIfiohbpM6LGc-h1go6Xb-IwyzmGtQx2D0B_Z5Eg1jSJR4tTUZ-c91HTq35mzNbENb7_7UeeFiL3Xy1TXAC5OYV4KGNKHa8SJlmnnt_Xz9oUkgLRpTr8qgTEN3Rnk4yAhoWV3WwlNA" 
                alt="Logo" 
                className="h-8 w-auto" 
              />
              Magic Library
            </h1>
          </Link>
        </div>
        
        <div className="hidden md:flex items-center gap-1 lg:gap-6 mr-auto ml-4 lg:ml-10">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                to={item.path}
                title={item.label}
                aria-label={item.label}
                className={cn(
                  'flex items-center gap-2 font-label-lg transition-all px-3 lg:px-4 py-2 rounded-full',
                  isActive 
                    ? 'bg-secondary-container text-on-secondary-container shadow-sm' 
                    : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            )
          })}
        </div>

        <div className="flex gap-2">
          {user?.email === 'leandrosolon@gmail.com' && (
            <Link 
              to="/admin"
              className={cn(
                "w-12 h-12 flex items-center justify-center rounded-full transition-all shadow-sm",
                location.pathname === '/admin' ? 'bg-primary text-on-primary' : 'bg-surface-container text-primary hover:scale-105'
              )}
              title="Painel de Administração"
            >
              <Shield className="w-5 h-5" />
            </Link>
          )}
          <Link 
            to="/profile"
            className={cn(
              "w-12 h-12 flex items-center justify-center rounded-full transition-all shadow-sm",
              location.pathname === '/profile' ? 'bg-primary text-on-primary' : 'bg-surface-container text-primary hover:scale-105'
            )}
            title="Meu Perfil"
          >
            <User className="w-5 h-5" />
          </Link>
          <button 
            onClick={logout}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-surface-container-high text-error hover:bg-error-container hover:scale-105 transition-all shadow-sm"
            title="Sair da Biblioteca"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
