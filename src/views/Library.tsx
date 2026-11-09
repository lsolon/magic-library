import { linkAcceptedLoans } from '../lib/loans';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Star, Plus, BookOpen, Trash2, Users, Share2, Handshake, Compass, Sparkles, Lock, Bookmark } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { BottomNav } from '../components/BottomNav';
import { BookCoverCard } from '../components/BookCoverCard';
import { cn } from '../lib/utils';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { syncUserGamificationStats } from '../lib/gamification';
import { removeBookKeepHistory } from '../lib/bookUtils';
import { motion, AnimatePresence } from 'motion/react';

interface UserBook {
  id: string; // docId of user_books
  bookId: string;
  status: string; // 'Lido', 'Lendo', 'Desejo'
  progress: number;
  bookDetails?: {
    title: string;
    author: string;
    coverUrl: string;
    category: string;
    difficulty: string;
    ownerId?: string;
    ownerName?: string;
    currentReaderId?: string;
    currentReaderName?: string;
    status?: string; // 'available' | 'borrowed' | 'reading_owner' | 'archived'
    isShareable?: boolean;
  };
}

export default function Library() {
  const { user } = useAuth();
  const [books, setBooks] = useState<UserBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('Todos'); // 'Todos', 'Lendo', 'Lido', 'Desejo', 'Emprestados', 'Compartilhei'
  const [searchQuery, setSearchQuery] = useState('');
  const [bookToDelete, setBookToDelete] = useState<UserBook | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    async function fetchBooks() {
      if (!user) return;
      setLoading(true);
      try {
        // 0. Empréstimos aprovados pelo dono entram na estante
        await linkAcceptedLoans(user.uid).catch(e => console.error('link loans', e));
        // 1. Fetch books in user_books
        const q = query(collection(db, 'user_books'), where('userId', '==', user.uid));
        const querySnapshot = await getDocs(q);
        
        const userBooksPromises = querySnapshot.docs.map(async (docSnap) => {
          const userBookData = docSnap.data();
          const bookRef = doc(db, 'books', userBookData.bookId);
          const bookSnap = await getDoc(bookRef);
          
          return {
            id: docSnap.id,
            ...userBookData,
            bookDetails: bookSnap.exists() ? bookSnap.data() : null
          } as UserBook;
        });

        const fetchedBooks = await Promise.all(userBooksPromises);
        const validBooks = fetchedBooks.filter(b => b.bookDetails);

        // 2. Fetch owned books directly from 'books' collection to ensure shared books are present
        const ownedQ = query(collection(db, 'books'), where('ownerId', '==', user.uid));
        const ownedSnap = await getDocs(ownedQ);
        
        const existingBookIds = new Set(validBooks.map(b => b.bookId));

        ownedSnap.docs.forEach(docSnap => {
          if (!existingBookIds.has(docSnap.id)) {
            const bookData = docSnap.data();
            validBooks.push({
              id: `owned_${docSnap.id}`,
              bookId: docSnap.id,
              status: bookData.status === 'available' || bookData.status === 'borrowed' ? 'Lido' : 'Lendo',
              progress: bookData.status === 'available' ? 100 : 50,
              bookDetails: bookData
            } as UserBook);
          }
        });

        setBooks(validBooks);
      } catch (err) {
        console.error("Error fetching books:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchBooks();
  }, [user]);

  const confirmDelete = async () => {
    if (!user || !bookToDelete) return;
    setIsDeleting(true);
    try {
      const targetBookId = bookToDelete.bookId || bookToDelete.id;
      await removeBookKeepHistory(user.uid, targetBookId, bookToDelete.id);
      setBooks(prev => prev.filter(b => b.id !== bookToDelete.id && b.bookId !== targetBookId));
      await syncUserGamificationStats(user.uid);
      setBookToDelete(null);
      alert('Livro removido da sua biblioteca. Todo o histórico de trocas e conversas foi preservado com sucesso.');
    } catch (err) {
      console.error('Error deleting book from library:', err);
      alert('Erro ao remover o livro. Tente novamente.');
    } finally {
      setIsDeleting(false);
    }
  };

  const filters = [
    { label: 'Todos', value: 'Todos' },
    { label: 'Lendo', value: 'Lendo' },
    { label: 'Lidos', value: 'Lido' },
    { label: 'Desejos', value: 'Desejo' },
    { label: 'Peguei Emprestados 🤝', value: 'Emprestados' },
    { label: 'Compartilhei 📖', value: 'Compartilhei' },
  ];

  const filteredBooks = books.filter(b => {
    // 1. Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const titleMatch = b.bookDetails?.title?.toLowerCase().includes(q);
      const authorMatch = b.bookDetails?.author?.toLowerCase().includes(q);
      if (!titleMatch && !authorMatch) return false;
    }

    // 2. Tab Filter
    if (activeFilter === 'Todos') {
      return true;
    }
    if (activeFilter === 'Lendo' || activeFilter === 'Lido' || activeFilter === 'Desejo') {
      return b.status === activeFilter;
    }
    if (activeFilter === 'Emprestados') {
      // Books borrowed from another owner
      return b.bookDetails?.ownerId && b.bookDetails.ownerId !== user?.uid;
    }
    if (activeFilter === 'Compartilhei') {
      // Books owned by current user that are shared or available or borrowed by someone
      const isOwner = b.bookDetails?.ownerId === user?.uid;
      const isSharedStatus = b.bookDetails?.status === 'available' || b.bookDetails?.status === 'borrowed' || b.bookDetails?.isShareable === true;
      return isOwner && isSharedStatus;
    }

    return true;
  });

  return (
    <div className="min-h-screen pb-[100px] bg-background text-on-background">
      <TopBar />

      <main className="max-w-[1200px] mx-auto px-6 pt-6 pb-24">
        {/* Search Bar (Bubble Style) */}
        <div className="mb-8 relative slide-down">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <Search className="text-primary w-6 h-6" />
          </div>
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Que aventura vamos ler hoje?" 
            className="w-full bg-background border-2 border-primary-container/50 rounded-full py-4 pl-12 pr-6 font-body-lg text-body-lg text-on-background placeholder-outline/60 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary-container/30 transition-all magic-shadow" 
          />
        </div>

        <h2 className="font-headline-lg-mobile text-on-background mb-6 flex items-center gap-2 slide-up">
          Minha Floresta de Livros
          <Sparkles className="w-6 h-6 text-tertiary-container" />
        </h2>

        {/* Filters (Pill/Bubble Style) */}
        <div className="flex gap-3 overflow-x-auto pb-4 mb-4 hide-scrollbar snap-x slide-up">
          {filters.map((filter) => (
            <button 
              key={filter.value}
              onClick={() => setActiveFilter(filter.value)}
              className={cn(
                "snap-start shrink-0 px-6 py-2 rounded-full font-label-lg text-xs hover:scale-105 transition-all cursor-pointer shadow-sm border-2",
                activeFilter === filter.value
                  ? "bg-secondary-container text-on-secondary-container border-white/50 magic-shadow" 
                  : "bg-surface-container-high text-on-surface-variant border-transparent"
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Books Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          <AnimatePresence mode="popLayout">
            {loading ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="col-span-full text-center py-20 flex flex-col items-center gap-4"
              >
                <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                <p className="font-body-lg text-on-surface-variant italic">Buscando na floresta mágica...</p>
              </motion.div>
            ) : filteredBooks.length === 0 ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="col-span-full text-center py-12 px-6 bg-surface-container/60 rounded-3xl border-2 border-dashed border-outline-variant/40 max-w-lg mx-auto my-4 flex flex-col items-center"
              >
                <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mb-4 text-primary shadow-inner">
                  <Compass className="w-8 h-8" />
                </div>
                <h3 className="font-headline-sm font-bold text-on-background mb-2">
                  {activeFilter === 'Emprestados'
                    ? 'Nenhum livro emprestado'
                    : activeFilter === 'Compartilhei'
                    ? 'Nenhum livro compartilhado'
                    : 'A floresta está silenciosa...'}
                </h3>
                <p className="text-xs text-on-surface-variant max-w-xs mb-6">
                  {activeFilter === 'Emprestados'
                    ? 'Livros que você pedir emprestado aos seus colegas nos Grupos aparecerão aqui.'
                    : 'Adicione livros à sua estante para acompanhar a leitura e compartilhar com seus amigos!'}
                </p>
                <Link
                  to="/add-book"
                  className="bg-primary text-on-surface font-label-lg px-6 py-3 rounded-full text-xs font-bold hover:scale-105 transition-transform flex items-center gap-2 shadow-lg"
                >
                  <Plus className="w-4 h-4" />
                  <span>Cadastrar Nova Aventura</span>
                </Link>
              </motion.div>
            ) : (
              [
                ...filteredBooks.map((userBook, index) => {
                  const isBorrowed = userBook.bookDetails?.ownerId && userBook.bookDetails.ownerId !== user?.uid;
                  const isSharedByMe = userBook.bookDetails?.ownerId === user?.uid && (userBook.bookDetails?.status === 'available' || userBook.bookDetails?.status === 'borrowed' || userBook.bookDetails?.isShareable === true);
                  const isLido = userBook.status === 'Lido';

                  return (
                    <motion.div 
                      key={userBook.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: index * 0.05 }}
                      layout
                      className="relative group/card"
                    >
                      <Link to={`/book/${userBook.bookId}`} className="bg-surface-container-low rounded-xl p-3 border-2 border-[#baeaff] magic-shadow hover:scale-[1.03] transition-all flex flex-col items-center relative overflow-hidden group">
                        
                        {/* Status Badge (Star in Top Right) */}
                        <div className={cn(
                          "absolute top-2 right-2 rounded-full w-8 h-8 flex items-center justify-center shadow-sm z-10 transition-transform group-hover:scale-110",
                          isLido ? "bg-tertiary-container text-on-tertiary-container" : "bg-secondary-container text-on-secondary-container"
                        )}>
                          {isLido ? (
                            <BookOpen className="w-4 h-4 fill-current" />
                          ) : (
                            <Star className="w-4 h-4 fill-current" />
                          )}
                        </div>

                        {/* Special Context Badge (Top Left - Borrowed/Shared) */}
                        {isBorrowed && (
                          <div className="absolute top-2 left-2 bg-tertiary-container text-on-tertiary-container rounded-full px-2 py-0.5 text-[9px] font-bold shadow-xs z-10 flex items-center gap-1 border border-white/40">
                            <Handshake className="w-3 h-3" />
                            <span className="truncate max-w-[60px]">Peguei de @{userBook.bookDetails?.ownerName?.split(' ')[0]}</span>
                          </div>
                        )}

                        <div className="w-full h-40 rounded-lg overflow-visible mb-3 relative bg-primary-container/10">
                          <BookCoverCard 
                            coverUrl={userBook.bookDetails?.coverUrl}
                            title={userBook.bookDetails?.title || 'Livro Desconhecido'}
                            author={userBook.bookDetails?.author}
                            className="w-full h-full"
                          />
                        </div>

                        <h3 className="font-body-lg text-body-lg text-center leading-tight mb-2 line-clamp-2 w-full font-bold text-on-background group-hover:text-primary transition-colors px-1">
                          {userBook.bookDetails?.title}
                        </h3>
                        
                        <div className="w-full mt-auto">
                          <div className="flex justify-between font-label-lg text-outline mb-1.5 text-[10px] uppercase tracking-wider">
                            <span>{isLido ? 'Concluído!' : 'Lendo...'}</span>
                            <span className={isLido ? "text-tertiary font-bold" : "font-bold"}>{userBook.progress}%</span>
                          </div>
                          <div className="h-2 w-full bg-surface-variant rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full rounded-full transition-all duration-700 ease-out", 
                                isLido ? "bg-tertiary-container" : "bg-primary progress-glow"
                              )} 
                              style={{ width: `${userBook.progress}%` }}
                            ></div>
                          </div>
                        </div>
                      </Link>

                      {/* Delete book button - floating over card */}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setBookToDelete(userBook);
                        }}
                        className="absolute -top-1 -left-1 bg-surface-container-low hover:bg-red-50 text-error p-2 rounded-full shadow-lg z-20 border border-error/20 opacity-0 group-hover/card:opacity-100 transition-all hover:scale-110 cursor-pointer"
                        title="Apagar Livro"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  );
                }),
                <motion.div
                  key="add-more-button"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: filteredBooks.length * 0.05 }}
                >
                  <Link 
                    to="/add-book" 
                    className="bg-surface-container/40 border-2 border-dashed border-outline-variant rounded-xl p-3 flex flex-col items-center justify-center min-h-[240px] hover:bg-surface-container/60 hover:border-primary transition-all hover:scale-[1.03] group"
                  >
                    <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center mb-4 group-hover:bg-primary-container group-hover:text-on-surface transition-all shadow-sm">
                      <Plus className="w-7 h-7 text-outline group-hover:text-on-surface" />
                    </div>
                    <span className="font-body-md text-on-surface-variant text-center font-bold px-2">Adicionar Nova Aventura</span>
                  </Link>
                </motion.div>
              ]
            )}
          </AnimatePresence>
        </div>

        {/* Floating Action Button (FAB) */}
        <button 
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-28 right-6 w-14 h-14 bg-secondary-container text-on-secondary-container rounded-full flex items-center justify-center magic-shadow hover:scale-110 active:scale-95 transition-all z-40 group shadow-[0_4px_15px_rgba(252,212,0,0.4)]"
        >
          <Sparkles className="w-7 h-7 group-hover:rotate-12 transition-transform" />
        </button>
      </main>

      {/* Delete Confirmation Modal */}
      {bookToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest max-w-sm w-full p-6 rounded-2xl border-2 border-error/30 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-error/15 text-error flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-headline-sm font-bold text-on-surface">Apagar Livro?</h3>
              <p className="font-body-sm text-on-surface-variant">
                Tem certeza que deseja remover <strong>"{bookToDelete.bookDetails?.title}"</strong> da sua biblioteca?
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setBookToDelete(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 px-4 rounded-xl border border-outline-variant text-on-surface hover:bg-surface-container-high font-label-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-error text-on-surface font-label-lg transition-transform hover:scale-105 active:scale-95 shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Apagando...' : 'Apagar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

