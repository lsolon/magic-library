import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Check, Lock, Sparkles, Bookmark, Plus, Compass, Search, Wand2 } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { BottomNav } from '../components/BottomNav';
import { VersionBadge } from '../components/VersionBadge';
import { BookCoverCard } from '../components/BookCoverCard';
import { TourGuide } from '../components/TourGuide';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAiSearchLimit } from '../lib/useAiSearchLimit';
import { authFetch } from '../lib/api';
import { calculateStatsFromBooks, getLevelInfo, EMPTY_STATS, GamificationStats } from '../lib/gamification';
import { useBand } from '../lib/useBand';

export default function Dashboard() {
  const { user } = useAuth();
  const band = useBand();
  const { copy, features } = band;
  const firstName = user?.displayName?.split(' ')[0] || 'Explorador(a) de Mundos';
  const [latestBook, setLatestBook] = useState<any>(null);
  const [userBooks, setUserBooks] = useState<any[]>([]);
  const [stats, setStats] = useState<GamificationStats>({ ...EMPTY_STATS });
  const levelInfo = getLevelInfo(stats.xp);
  const xpIntoLevel = levelInfo.xpIntoLevel;
  const levelProgressPct = levelInfo.progressPct;

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchError, setSearchError] = useState('');
  const aiLimit = useAiSearchLimit();

  useEffect(() => {
    async function fetchData() {
      if (!user) return;
      try {
        // user_books guarda só o vínculo (bookId, status, progresso);
        // título, autor e capa ficam em 'books' — mesmo "join" da tela Livros.
        const allBooksSnap = await getDocs(
          query(collection(db, 'user_books'), where('userId', '==', user.uid))
        );
        const rawBooks = allBooksSnap.docs.map(d => d.data());

        const joined = await Promise.all(
          rawBooks.map(async (ub: any) => {
            try {
              const bookSnap = await getDoc(doc(db, 'books', ub.bookId));
              return { ...ub, bookDetails: bookSnap.exists() ? bookSnap.data() : null };
            } catch {
              return { ...ub, bookDetails: null };
            }
          })
        );
        // Ignora vínculos órfãos (livro apagado), como a tela Livros faz
        const validBooks = joined.filter(b => b.bookDetails);

        setUserBooks(validBooks);
        setStats(calculateStatsFromBooks(validBooks));
        setLatestBook(validBooks.find(b => b.status === 'Lendo') || validBooks[0] || null);
      } catch (err) {
        console.error(err);
      }
    }
    fetchData();
  }, [user]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError('');
    setSearchResult(null);

    try {
      const res = await authFetch('api/search-book', { query: searchQuery });

      if (res.status === 429) {
        throw new Error('Você atingiu o limite de buscas por hoje. Tente novamente mais tarde.');
      }
      if (!res.ok) {
        throw new Error('Falha ao buscar as informações do livro.');
      }

      const data = await res.json();
      setSearchResult(data);
      aiLimit.incrementSearch();
    } catch (err: any) {
      setSearchError(err.message || 'Erro ao buscar o livro.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen pb-[100px] md:pb-0 bg-background text-on-background relative overflow-x-hidden selection:bg-primary-container selection:text-on-primary-container">
      <TopBar />
      
      <main className="max-w-[1200px] mx-auto px-6 py-6 flex flex-col gap-8">
        {/* Welcome Section */}
        <section className="text-center mt-2">
          <h2 className="font-headline-xl text-primary mb-2">{copy.greeting(firstName)}</h2>
          <p className="font-body-lg text-on-surface-variant">{copy.subtitle}</p>
        </section>

        {/* Missão do Dia (Hero Card) */}
        <section className={`w-full rounded-[2rem] p-6 ${features.playfulHero ? 'bg-gradient-to-br from-primary-container to-inverse-primary' : 'bg-surface-container border border-outline-variant'} shadow-[0_8px_30px_rgba(0, 229, 255, 0.2)] relative overflow-hidden group`}>
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-surface-container-high/60 rounded-full blur-xl pointer-events-none"></div>
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-secondary-container/30 rounded-full blur-2xl pointer-events-none"></div>
          <div className="relative z-10 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-surface-container-high/60 backdrop-blur-sm flex items-center justify-center shadow-inner float-anim">
              <BookOpen className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="font-headline-lg-mobile text-on-primary-container">{copy.missionTitle}</h3>
              <p className="font-body-md text-on-primary-container/80 mt-1">
                {latestBook?.bookDetails?.title
                  ? copy.missionWithBook(latestBook.bookDetails.title)
                  : copy.missionNoBook}
              </p>
            </div>
            <Link 
              to={latestBook ? `/book/${latestBook.bookId}` : "/add-book"} 
              className="mt-2 bg-secondary-container text-on-secondary-container font-label-lg px-8 py-3 rounded-full shadow-[0_4px_15px_rgba(252,212,0,0.4)] hover:scale-105 transition-transform active:scale-95"
            >
              {latestBook ? copy.missionCta : copy.missionCtaEmpty}
            </Link>
          </div>
        </section>

        {/* Mapa da Aventura (Progresso) — Fundamental I e II */}
        {features.adventureMap && (
        <section className="w-full bg-surface-container rounded-[2rem] p-6 shadow-sm border border-white/50 relative">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-headline-lg-mobile text-primary">{copy.progressTitle}</h3>
            <div className="flex items-center gap-1 bg-surface rounded-full px-3 py-1 shadow-sm">
              <Sparkles className="w-4 h-4 text-secondary fill-secondary" />
              <span className="font-label-lg text-secondary">Nível {stats.level}</span>
            </div>
          </div>
          <p className="font-body-sm text-on-surface-variant -mt-3 mb-2">
            {xpIntoLevel} / {levelInfo.xpForNext} XP para o Nível {stats.level + 1}
          </p>
          <div className="relative h-32 w-full flex items-center justify-between px-4">
            {/* Path Line */}
            <div className="absolute left-0 right-0 h-3 bg-surface-variant rounded-full mx-8 z-0">
              <div
                className="h-full bg-primary-container rounded-full transition-all duration-500"
                style={{ width: `${levelProgressPct}%` }}
              ></div>
            </div>
            {/* Stops */}
            <div className="relative z-10 flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-primary-container border-4 border-surface flex items-center justify-center shadow-md">
                <Check className="w-6 h-6 text-primary" />
              </div>
            </div>
            <div className="relative z-10 flex flex-col items-center gap-2 -translate-y-4">
              <div className="w-14 h-14 rounded-full bg-secondary-container border-4 border-surface flex items-center justify-center shadow-[0_4px_15px_rgba(252,212,0,0.3)] pulse-anim cursor-pointer">
                <Sparkles className="w-7 h-7 text-on-secondary-container fill-current" />
              </div>
            </div>
            <div className="relative z-10 flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-surface-variant border-4 border-surface flex items-center justify-center shadow-sm text-outline">
                <Lock className="w-5 h-5" />
              </div>
            </div>
            <div className="relative z-10 flex flex-col items-center gap-2 -translate-y-4">
              <div className="w-12 h-12 rounded-full bg-surface-variant border-4 border-surface flex items-center justify-center shadow-sm text-outline">
                <Lock className="w-5 h-5" />
              </div>
            </div>
          </div>
        </section>
        )}

        {/* Painel de progresso (números) — Fundamental II e Médio */}
        {features.statsPanel && (
          <section className="w-full bg-surface-container rounded-[2rem] p-6 border border-outline-variant">
            {!features.adventureMap && (
              <h3 className="font-headline-lg-mobile text-primary mb-4">{copy.progressTitle}</h3>
            )}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-surface rounded-2xl p-4">
                <div className="font-headline-lg text-on-surface">{stats.completedBooks}</div>
                <div className="font-label-lg text-on-surface-variant">livros lidos</div>
              </div>
              <div className="bg-surface rounded-2xl p-4">
                <div className="font-headline-lg text-on-surface">{stats.totalPagesRead}</div>
                <div className="font-label-lg text-on-surface-variant">páginas</div>
              </div>
              <div className="bg-surface rounded-2xl p-4">
                <div className="font-headline-lg text-on-surface">{stats.level}</div>
                <div className="font-label-lg text-on-surface-variant">nível</div>
              </div>
            </div>
            {!features.adventureMap && (
              <div className="mt-4">
                <div className="flex justify-between font-body-sm text-on-surface-variant mb-1">
                  <span>{xpIntoLevel} / {levelInfo.xpForNext} XP</span>
                  <span>próximo nível: {stats.level + 1}</span>
                </div>
                <div className="w-full bg-surface-variant rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${levelProgressPct}%` }}></div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Estante (Carrossel) */}
        <section className="w-full">
          <h3 className="font-headline-lg-mobile text-primary mb-4 px-2">{copy.shelfTitle}</h3>
          <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-4 px-2 -mx-2 snap-x snap-mandatory">
            {userBooks.slice(0, 10).map((ub) => (
              <Link 
                key={ub.bookId}
                to={`/book/${ub.bookId}`}
                className="snap-center shrink-0 w-[200px] bg-surface-container-lowest rounded-xl p-3 shadow-md border-2 border-primary-container/30 flex flex-col gap-3 hover:scale-105 transition-transform cursor-pointer"
              >
                <div className="w-full h-48 rounded-lg overflow-visible bg-surface-variant relative">
                  <BookCoverCard 
                    coverUrl={ub.bookDetails?.coverUrl}
                    title={ub.bookDetails?.title || 'Livro Desconhecido'}
                    author={ub.bookDetails?.author}
                    className="w-full h-full"
                  />
                  <div className="absolute top-2 right-2 bg-surface/90 backdrop-blur-sm rounded-full p-1.5 shadow-sm z-10">
                    <Bookmark className="w-3.5 h-3.5 text-primary fill-primary" />
                  </div>
                </div>
                <div>
                  <h4 className="font-body-lg text-on-surface truncate">{ub.bookDetails?.title}</h4>
                  <div className="w-full bg-surface-variant rounded-full h-2 mt-2">
                    <div 
                      className="bg-tertiary-container h-2 rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min(100, Math.round(((ub.pagesRead || 0) / (ub.bookDetails?.totalPages || 1)) * 100))}%` }}
                    ></div>
                  </div>
                </div>
              </Link>
            ))}
            
            {/* Add More Button */}
            <Link 
              to="/add-book"
              className="snap-center shrink-0 w-[200px] bg-surface-container-lowest rounded-xl p-3 shadow-md border-2 border-primary-container/30 flex flex-col gap-3 hover:scale-105 transition-transform cursor-pointer group"
            >
              <div className="w-full h-48 rounded-lg overflow-hidden bg-surface-variant flex items-center justify-center group-hover:bg-primary-container/20 transition-colors">
                <div className="w-16 h-16 rounded-full bg-primary-container/50 flex items-center justify-center">
                  <Plus className="w-8 h-8 text-primary" />
                </div>
              </div>
              <div>
                <h4 className="font-body-lg text-on-surface text-center">{copy.shelfAdd}</h4>
              </div>
            </Link>
          </div>
        </section>

        {/* AI Book Search - Refined Integration */}
        <section className="w-full">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
            <h3 className="font-headline-lg-mobile text-primary flex items-center gap-2">
              <Compass className="w-6 h-6 text-tertiary" /> Buscar Livro com IA
            </h3>
            <div className="text-sm font-body-sm text-on-surface-variant bg-surface-container-highest py-1 px-4 rounded-full self-start sm:self-auto flex flex-col items-center">
              <span>{aiLimit.searchesLeft} de {aiLimit.maxSearches} buscas restantes</span>
              {aiLimit.timeLeft && aiLimit.searchesLeft < aiLimit.maxSearches && (
                <span className="text-xs opacity-75">
                  Recarrega em {aiLimit.timeLeft.hours}h {aiLimit.timeLeft.minutes}m
                </span>
              )}
            </div>
          </div>
          <div className="bg-surface-container rounded-[2rem] p-6 border-2 border-surface-container-highest shadow-sm">
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-on-surface-variant" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ex: Harry Potter e a Pedra Filosofal"
                  className="w-full pl-11 pr-4 py-4 bg-surface-container-highest border-2 border-surface-variant rounded-full font-body-md text-on-surface focus:outline-none focus:border-tertiary transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching || !searchQuery.trim() || !aiLimit.canSearch}
                className="bg-tertiary text-on-tertiary font-label-lg px-8 py-4 rounded-full shadow-sm hover:scale-105 transition-transform active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
              >
                {isSearching ? 'Buscando...' : 'Buscar'}
              </button>
            </form>

            {searchError && (
              <div className="text-error font-body-md bg-error-container/20 p-4 rounded-xl border border-error/30 text-center">
                {searchError}
              </div>
            )}

            {searchResult && Array.isArray(searchResult) && (
              <div className="mt-6 flex flex-col gap-6 slide-up">
                {searchResult.map((result: any, index: number) => (
                  <div key={index} className="bg-surface-container-lowest rounded-2xl p-6 border-2 border-tertiary-container shadow-inner flex flex-col md:flex-row gap-6">
                    <div className="w-full md:w-48 shrink-0">
                      <BookCoverCard
                        coverUrl={result.coverUrl}
                        title={result.title}
                        author={result.author}
                        synopsis={result.synopsis}
                        className="w-full h-64 shadow-md border border-primary/20"
                      />
                    </div>
                    <div className="flex-1 flex flex-col">
                      <h4 className="font-headline-lg text-primary mb-4 border-b border-surface-variant pb-2">{result.title}</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-body-md text-on-surface mb-6 flex-1">
                        <div><strong className="text-primary">Autor:</strong> {result.author}</div>
                        <div><strong className="text-primary">Editora:</strong> {result.publisher || 'Desconhecida'}</div>
                        <div><strong className="text-primary">Ano:</strong> {result.year}</div>
                        <div><strong className="text-primary">Páginas:</strong> {result.pages}</div>
                      </div>
                      
                      <div className="flex justify-end border-t border-surface-variant pt-4 mt-auto">
                        <Link 
                          to="/add-book"
                          state={{ bookData: result }}
                          className="bg-primary text-on-primary font-label-lg px-6 py-3 rounded-full shadow-[0_4px_15px_rgba(0,77,98,0.3)] hover:scale-105 transition-transform active:scale-95 flex items-center gap-2"
                        >
                          <Plus className="w-5 h-5" />
                          Adicionar à Estante
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
        <VersionBadge className="pb-2" />
      </main>

      <TourGuide />
      <BottomNav />
    </div>
  );
}
