import { safeAvatar } from '../lib/avatars';
import { useState } from 'react';
import { BookOpen, User as UserIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface BookCoverCardProps {
  coverUrl?: string;
  title: string;
  author?: string;
  synopsis?: string;
  showUserAvatar?: boolean;
  className?: string;
  ownerAvatar?: string;
  ownerName?: string;
  onTitleEdit?: (newTitle: string) => void;
}

export function BookCoverCard({
  coverUrl,
  title,
  author,
  synopsis,
  showUserAvatar = false,
  className = "w-full h-40",
  ownerAvatar,
  ownerName,
  onTitleEdit
}: BookCoverCardProps) {
  const { user } = useAuth();
  const [imageError, setImageError] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState(title);

  const DEFAULT_COVER = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCcA_pcn1CD283UmkglhGz5sTiIME3I_srxL-_jAh9skbm-ZyMMl8HVH_y0Cd4t47tZqZ5uGjJWKbF8_eDMnc_hEWjGFxkzz6OAq7tAKigSCQ7Kn7EN-zHjYd9oY_vve5fo5DVtysJ8jQm40BiOGEABRFhw_-b-Mqz8qX2Y5WJOJcTUGaycKJL8uk9S9HCu2gfwNdh6E8j5bj75k-faZZHWG9fKE41K-LAgjFtaE3MOnxyg1TXmQgefPoBCRe-fq27Kg1RsoHYVp76Z';
  const effectiveCoverUrl = coverUrl === DEFAULT_COVER ? '' : coverUrl;

  const effectiveAvatar = safeAvatar(ownerAvatar, ownerName || user?.uid || 'anon');
  const rawName = ownerName || user?.displayName || 'Explorador(a) de Mundos';
  const formattedName = rawName.startsWith('@') ? rawName : `@${rawName}`;

  // Generate a consistent subtle gradient based on title length if no image
  const gradients = [
    "from-primary/90 via-primary-container to-secondary-container",
    "from-tertiary/90 via-surface-variant to-primary-container",
    "from-secondary/90 via-surface-container-highest to-tertiary-container",
    "from-primary-fixed via-secondary-fixed to-surface-variant"
  ];
  const gradientIndex = (title?.length || 0) % gradients.length;
  const fallbackGradient = gradients[gradientIndex];

  return (
    <div className={`relative overflow-hidden rounded-lg bg-surface-variant shadow-md flex flex-col justify-end transition-all duration-300 ease-out hover:scale-[1.03] hover:-translate-y-1 hover:-rotate-1 hover:shadow-xl hover:z-10 cursor-pointer ${className}`}>
      {effectiveCoverUrl && !imageError ? (
        <img
          src={effectiveCoverUrl}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setImageError(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className={`absolute inset-0 bg-[#3e2723] border-l-[12px] border-[#271815] p-4 flex flex-col justify-center items-center text-[#d7ccc8] relative shadow-inner overflow-hidden`}>
          {/* Subtle noise texture overlay using gradients */}
          <div className="absolute inset-0 opacity-20 mix-blend-overlay bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#5d4037] via-[#3e2723] to-[#1a100d]"></div>
          
          {/* Embossed borders */}
          <div className="absolute inset-2 border-2 border-[#5d4037] rounded-sm opacity-50 shadow-[inset_0_0_8px_rgba(0,0,0,0.5)]"></div>
          <div className="absolute inset-3 border border-[#795548] rounded-sm opacity-30"></div>
          
          <div className="my-auto text-center px-2 z-10 w-full group relative">
            {isEditingTitle ? (
              <input
                type="text"
                value={editTitleValue}
                onChange={(e) => setEditTitleValue(e.target.value)}
                onBlur={() => {
                  setIsEditingTitle(false);
                  if (editTitleValue.trim() !== title && onTitleEdit) {
                    onTitleEdit(editTitleValue.trim());
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                autoFocus
                className="w-full bg-black/40 border border-[#795548] text-center font-headline-sm font-bold text-sm text-[#e0e0e0] tracking-widest uppercase rounded p-1 mb-4 focus:outline-none focus:ring-1 focus:ring-[#8d6e63]"
              />
            ) : (
              <div 
                className={`relative ${onTitleEdit ? 'cursor-pointer hover:bg-surface-container-high/60 rounded p-1' : ''}`}
                onClick={() => onTitleEdit && setIsEditingTitle(true)}
                title={onTitleEdit ? "Clique para editar o título" : undefined}
              >
                <h4 className="font-headline-sm font-bold line-clamp-3 text-sm drop-shadow-md mb-4 text-[#e0e0e0] tracking-widest uppercase opacity-90" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>
                  {title}
                </h4>
              </div>
            )}
            
            <div className="w-full flex justify-center items-center gap-2 mb-4 opacity-50">
              <div className="w-8 h-[1px] bg-[#8d6e63]"></div>
              <div className="w-2 h-2 rounded-full bg-[#8d6e63] shrink-0"></div>
              <div className="w-8 h-[1px] bg-[#8d6e63]"></div>
            </div>
            
            <p style={{ fontFamily: 'var(--font-handwriting)', fontSize: '1.5rem', lineHeight: '1.2', color: '#d7ccc8', transform: 'rotate(-3deg)', textShadow: '1px 1px 0 rgba(0,0,0,0.5)' }} className="drop-shadow-md">
              de {rawName}
            </p>
          </div>
          
          <div className="absolute bottom-4 opacity-40 text-[#5d4037]">
            <BookOpen className="w-8 h-8" />
          </div>
        </div>
      )}

      {/* Title Overlay Banner when cover image is present */}
      {effectiveCoverUrl && !imageError && (
        <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-2 pt-6 text-on-surface ${showUserAvatar || ownerName ? 'pb-7' : ''}`}>
          <h4 className="font-headline-sm font-bold text-xs line-clamp-2 drop-shadow-md leading-tight">{title}</h4>
          {author && <p className="font-body-xs text-white/80 text-[10px] line-clamp-1 mt-0.5">{author}</p>}
        </div>
      )}

      {/* Owner Badge Pill Overlay (Matching design with avatar and @NomeExclusivo) */}
      {(showUserAvatar || ownerName) && (
        <div 
          className="absolute bottom-1.5 right-1.5 z-20 flex items-center gap-1.5 bg-[#F6F5E3] text-[#135468] border border-[#135468]/30 px-2 py-0.5 rounded-full shadow-md backdrop-blur-md max-w-[90%]"
          title={`Guardião(ã) do livro: ${rawName}`}
        >
          <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full overflow-hidden bg-primary-container border border-primary/50 shrink-0 flex items-center justify-center">
            {effectiveAvatar ? (
              <img src={effectiveAvatar} alt={rawName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <UserIcon className="w-3 h-3 text-[#135468]" />
            )}
          </div>
          <span className="text-[10px] sm:text-xs font-bold tracking-tight truncate max-w-[110px]">
            {formattedName}
          </span>
        </div>
      )}
    </div>
  );
}
