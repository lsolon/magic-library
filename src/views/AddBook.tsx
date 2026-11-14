import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, BookOpen, Sparkles, Book, User, LayoutGrid, Star, PlusCircle } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { syncUserGamificationStats } from '../lib/gamification';
import { logReadingProgress } from '../lib/readingLog';
import { useAuth } from '../contexts/AuthContext';
import { TopBar } from '../components/TopBar';
import { BottomNav } from '../components/BottomNav';

export default function AddBook() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState('Aventura Épica');
  const [difficulty, setDifficulty] = useState('Iniciante');
  const [status, setStatus] = useState('Desejo');
  const [totalPages, setTotalPages] = useState<number | ''>('');
  const [pagesRead, setPagesRead] = useState<number | ''>('');
  const [isAvailableForShare, setIsAvailableForShare] = useState(false);
  const [synopsis, setSynopsis] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (location.state && location.state.bookData) {
      const { title, author, pages, synopsis, coverUrl } = location.state.bookData;
      if (title) setTitle(title);
      if (author) setAuthor(author);
      if (pages) setTotalPages(pages);
      if (synopsis) setSynopsis(synopsis);
      if (coverUrl) setCoverUrl(coverUrl);
    }
  }, [location.state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setIsLoading(true);
    setError('');

    try {
      // 1. Save the book to the global books collection
      const bookRef = await addDoc(collection(db, 'books'), {
        title,
        author,
        category,
        difficulty,
        synopsis,
        totalPages: Number(totalPages) || 0,
        coverUrl: coverUrl || '', // No default, BookCoverCard will handle it
        ownerId: user.uid,
        ownerName: user.displayName || 'Explorador(a) de Mundos',
        currentReaderId: (status === 'Lido' || (status === 'Lendo' && Number(pagesRead) >= Number(totalPages))) && isAvailableForShare ? null : user.uid,
        currentReaderName: (status === 'Lido' || (status === 'Lendo' && Number(pagesRead) >= Number(totalPages))) && isAvailableForShare ? null : user.displayName || 'Explorador(a) de Mundos',
        status: (status === 'Lido' || (status === 'Lendo' && Number(pagesRead) >= Number(totalPages))) && isAvailableForShare ? 'available' : 'reading_owner',
        addedBy: user.uid,
        addedAt: serverTimestamp()
      });

      // 2. Add the book to the user's personal library
      const numTotalPages = Number(totalPages) || 1;
      let calculatedProgress = 0;
      let numPagesRead = 0;
      if (status === 'Lido') {
        calculatedProgress = 100;
        numPagesRead = numTotalPages;
      } else if (status === 'Lendo') {
        numPagesRead = Number(pagesRead) || 0;
        calculatedProgress = Math.round((numPagesRead / numTotalPages) * 100);
      }

      // Nunca mais páginas do que o livro tem
      numPagesRead = Math.min(numPagesRead, numTotalPages);

      await addDoc(collection(db, 'user_books'), {
        userId: user.uid,
        bookId: bookRef.id,
        status: status, // 'Lido', 'Lendo', 'Desejo'
        progress: calculatedProgress,
        pagesRead: numPagesRead,
        maxPagesRead: numPagesRead,
        addedAt: serverTimestamp()
      });

      // Páginas informadas no cadastro entram no log do dia (com o teto diário de XP)
      await logReadingProgress(user.uid, bookRef.id, numPagesRead, 0);

      // Update user gamification stats (XP, Stars, Level)
      await syncUserGamificationStats(user.uid);

      // Show success and redirect
      if (status === 'Lido') {
        alert('Livro adicionado! 🎉 Agora registre sua leitura para ganhar o bônus de conclusão.');
        navigate(`/book/${bookRef.id}`);
      } else {
        alert('Livro adicionado à sua biblioteca com sucesso! 🎉');
        navigate('/library');
      }
    } catch (err: any) {
      console.error(err);
      setError('Falha ao adicionar o livro mágico. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-background pb-[100px] md:pb-0 relative overflow-x-hidden">
      {/* Playful Background Shapes */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none opacity-40">
        <div className="absolute top-[10%] left-[-5%] w-64 h-64 bg-primary-container rounded-full mix-blend-multiply filter blur-3xl opacity-70 float-anim"></div>
        <div className="absolute bottom-[20%] right-[-10%] w-80 h-80 bg-tertiary-container rounded-full mix-blend-multiply filter blur-3xl opacity-70 pulse-anim"></div>
      </div>

      <TopBar />

      <main className="relative z-10 w-full max-w-[800px] mx-auto px-4 py-8">
        
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate(-1)} className="w-12 h-12 flex items-center justify-center rounded-full bg-surface-container text-on-surface shadow-sm hover:bg-surface-variant transition-colors hover:scale-105">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="font-headline-lg-mobile text-primary drop-shadow-sm flex items-center gap-2">
            <BookOpen className="w-8 h-8 text-secondary fill-secondary/20" />
            Adicionar Livro
          </h1>
        </div>

        <div className="glass-panel bg-surface-container-lowest/80 rounded-3xl p-6 md:p-8 magic-shadow border-[2px] border-primary-container/50 relative">
          <div className="absolute -top-4 -right-4 bg-tertiary-container text-on-tertiary-container w-12 h-12 rounded-full flex items-center justify-center shadow-md transform rotate-12">
            <Sparkles className="w-6 h-6 fill-current" />
          </div>

          <p className="font-body-lg text-on-surface-variant mb-6 text-center">
            Qual nova aventura você encontrou, mago?
          </p>

          {error && (
            <div className="bg-error-container text-on-error-container p-3 rounded-xl mb-6 font-body-md text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            
            <div className="space-y-1">
              <label className="font-label-lg text-on-surface-variant ml-1 block">Título da Aventura</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-primary">
                  <Book className="w-5 h-5" />
                </div>
                <input 
                  type="text" 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Harry Potter, O Pequeno Príncipe..."
                  required
                  className="w-full bg-surface-container-highest border-2 border-surface-variant rounded-xl py-3 pl-12 pr-4 font-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary-container/30 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-label-lg text-on-surface-variant ml-1 block">Autor (O Criador Mágico)</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-primary">
                  <User className="w-5 h-5" />
                </div>
                <input 
                  type="text" 
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Nome de quem escreveu o livro"
                  required
                  className="w-full bg-surface-container-highest border-2 border-surface-variant rounded-xl py-3 pl-12 pr-4 font-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary-container/30 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1">
                <label className="font-label-lg text-on-surface-variant ml-1 block">Categoria</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-primary">
                    <LayoutGrid className="w-5 h-5" />
                  </div>
                  <select 
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-surface-container-highest border-2 border-surface-variant rounded-xl py-3 pl-12 pr-10 font-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary-container/30 transition-all appearance-none"
                  >
                    <option value="Aventura Épica">Aventura Épica</option>
                    <option value="Contos de Fadas">Contos de Fadas</option>
                    <option value="Mistério">Mistério</option>
                    <option value="Animais Fantásticos">Animais Fantásticos</option>
                    <option value="Espaço">Viagem Espacial</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-label-lg text-on-surface-variant ml-1 block">Nível de Dificuldade</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-primary">
                    <Star className="w-5 h-5" />
                  </div>
                  <select 
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="w-full bg-surface-container-highest border-2 border-surface-variant rounded-xl py-3 pl-12 pr-10 font-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary-container/30 transition-all appearance-none"
                  >
                    <option value="Iniciante">Iniciante 🟢</option>
                    <option value="Aventureiro">Aventureiro 🟡</option>
                    <option value="Mestre">Mestre 🔴</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-label-lg text-on-surface-variant ml-1 block">Onde guardar na sua biblioteca?</label>
              <div className="flex gap-3">
                {['Desejo', 'Lendo', 'Lido'].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setStatus(opt)}
                    className={`flex-1 py-3 rounded-xl font-label-lg transition-all border-2 ${
                      status === opt 
                        ? 'bg-secondary-container text-on-secondary-container border-secondary-container shadow-sm transform scale-105' 
                        : 'bg-surface-container-highest text-on-surface-variant border-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {opt === 'Desejo' && '⭐ Quero ler'}
                    {opt === 'Lendo' && '📖 Lendo'}
                    {opt === 'Lido' && '✅ Já li'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1">
                <label className="font-label-lg text-on-surface-variant ml-1 block">Total de Páginas</label>
                <input 
                  type="number" 
                  value={totalPages}
                  onChange={(e) => setTotalPages(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Ex: 350"
                  required
                  min="1"
                  className="w-full bg-surface-container-highest border-2 border-surface-variant rounded-xl py-3 px-4 font-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary-container/30 transition-all"
                />
              </div>

              {status === 'Lendo' && (
                <div className="space-y-1">
                  <label className="font-label-lg text-on-surface-variant ml-1 block">Páginas Lidas</label>
                  <input 
                    type="number" 
                    value={pagesRead}
                    onChange={(e) => setPagesRead(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Ex: 120"
                    min="0"
                    max={totalPages || undefined}
                    className="w-full bg-surface-container-highest border-2 border-surface-variant rounded-xl py-3 px-4 font-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary-container/30 transition-all"
                  />
                </div>
              )}
            </div>

            {(() => {
              const numTotal = Number(totalPages) || 0;
              const numRead = Number(pagesRead) || 0;
              const is100Percent = status === 'Lido' || (status === 'Lendo' && numTotal > 0 && numRead >= numTotal);
              
              return (
                <div className={`space-y-2 bg-surface-container p-4 rounded-xl border ${is100Percent ? 'border-primary-container/30' : 'border-surface-variant/50'}`}>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="shareBook"
                      checked={is100Percent && isAvailableForShare}
                      disabled={!is100Percent}
                      onChange={(e) => setIsAvailableForShare(e.target.checked)}
                      className="w-5 h-5 text-primary bg-surface-container-highest border-surface-variant rounded focus:ring-primary disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <label htmlFor="shareBook" className={`font-body-md ${is100Percent ? 'text-on-surface font-semibold' : 'text-on-surface-variant/70'}`}>
                      Disponibilizar este livro na <strong>Biblioteca Compartilhada</strong> dos meus grupos
                    </label>
                  </div>
                  {!is100Percent && (
                    <p className="font-body-sm text-on-surface-variant italic ml-8">
                      🔒 Você só pode disponibilizar o livro para empréstimo após atingir 100% de leitura (leia todas as páginas ou marque a situação como "Já li").
                    </p>
                  )}
                </div>
              );
            })()}

            <div className="space-y-1">
              <label className="font-label-lg text-on-surface-variant ml-1 block">Sobre o que é? (Opcional)</label>
              <textarea 
                value={synopsis}
                onChange={(e) => setSynopsis(e.target.value)}
                placeholder="Um pequeno resumo mágico desta aventura..."
                rows={3}
                className="w-full bg-surface-container-highest border-2 border-surface-variant rounded-xl py-3 px-4 font-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary-container/30 transition-all resize-none"
              ></textarea>
            </div>

            <button 
              type="submit" 
              disabled={isLoading}
              className="mt-4 w-full bg-primary text-on-primary font-headline-lg-mobile text-[18px] py-4 rounded-xl shadow-[0_8px_0_rgba(0,77,98,0.3)] hover:translate-y-1 hover:shadow-[0_4px_0_rgba(0,77,98,0.3)] active:translate-y-2 active:shadow-none transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:pointer-events-none"
            >
              <PlusCircle className="w-6 h-6" />
              {isLoading ? 'Guardando...' : 'Guardar na Biblioteca'}
            </button>
          </form>

        </div>
      </main>

      <BottomNav />
    </div>
  );
}
