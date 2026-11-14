import { Link, useLocation } from 'react-router-dom';
import { Compass, BookOpen, Package, User, MessageSquare } from 'lucide-react';
import { cn } from '../lib/utils';
import { useBand } from '../lib/useBand';
import { useAuth } from '../contexts/AuthContext';
import { useChatUnread } from '../lib/chatUnread';

export function BottomNav() {
  const location = useLocation();
  const homeLabel = useBand().copy.navHome;
  const { user } = useAuth();
  const unread = useChatUnread(user?.uid).count;

  const navItems = [
    { path: '/dashboard', icon: Compass, label: homeLabel },
    { path: '/library', icon: BookOpen, label: 'Livros' },
    { path: '/clubs', icon: Package, label: 'Grupos' },
    { path: '/chat', icon: MessageSquare, label: 'Chat' },
    { path: '/profile', icon: User, label: 'Perfil' },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-between gap-1 items-center px-2 pb-6 pt-2 bg-surface-container/90 backdrop-blur-xl rounded-t-xl shadow-[0_-10px_40px_rgba(112,93,0,0.15)] overflow-x-auto no-scrollbar">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        const Icon = item.icon;

        return (
          <Link
            key={item.label}
            to={item.path}
            className={cn(
              'flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-200 shrink-0 min-w-[60px]',
              isActive
                ? 'bg-secondary-container text-on-secondary-container rounded-full px-3 py-2 scale-105 shadow-md'
                : 'text-on-surface-variant opacity-70 hover:bg-secondary-fixed-dim/20 active:scale-95'
            )}
          >
            <span className="relative">
              <Icon className="w-5 h-5 mb-1" />
              {item.path === '/chat' && unread > 0 && (
                <span aria-label={`${unread} conversa(s) com mensagem nova`} className="absolute -top-2 -right-3 min-w-[16px] h-4 px-1 rounded-full bg-error text-on-error text-[10px] font-bold flex items-center justify-center">{unread}</span>
              )}
            </span>
            <span className="font-label-lg mt-0.5 text-[10px] leading-tight text-center">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
