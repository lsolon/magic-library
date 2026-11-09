import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Sparkles, Award, Star, Shield, Save, Camera, ArrowLeft, Lock, Trash2, AlertTriangle, Book, Flame, Timer, Package, Crown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { TopBar } from '../components/TopBar';
import { BottomNav } from '../components/BottomNav';
import { VersionBadge } from '../components/VersionBadge';
import { AVATAR_PRESETS, safeAvatar } from '../lib/avatars';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { syncUserGamificationStats, calculateBadges, BadgeDef, GamificationStats } from '../lib/gamification';
import { clearAllUserData } from '../lib/dataUtils';

export default function Profile() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [realName, setRealName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [magicalTitle, setMagicalTitle] = useState('Explorador(a) de Mundos');
  const [favoriteGenres, setFavoriteGenres] = useState('Fantasia, Aventura, Mistério');
  const [bio, setBio] = useState('Amante de livros mágicos e universos fantásticos.');
  const [stats, setStats] = useState<GamificationStats>({ level: 1, xp: 0, stars: 0, totalBooks: 0, completedBooks: 0, totalPagesRead: 0 });
  const [badges, setBadges] = useState<BadgeDef[]>([]);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');
  const [isClearingData, setIsClearingData] = useState(false);

  const handleClearUserData = async () => {
    if (!user) return;
    if (!window.confirm("Atenção: Deseja apagar todos os seus livros, histórico de trocas e progresso de leitura? Essa ação não pode ser desfeita.")) {
      return;
    }

    setIsClearingData(true);
    setError('');
    setSuccessMessage('');

    try {
      await clearAllUserData(user.uid);
      setStats({ level: 1, xp: 0, stars: 0, totalBooks: 0, completedBooks: 0, totalPagesRead: 0 });
      setBadges(calculateBadges({ level: 1, xp: 0, stars: 0, totalBooks: 0, completedBooks: 0, totalPagesRead: 0 }));
      setSuccessMessage('Todos os seus livros e dados foram apagados com sucesso! ✨');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      console.error('Error clearing user data:', err);
      setError('Falha ao limpar seus dados. Tente novamente.');
    } finally {
      setIsClearingData(false);
    }
  };

  useEffect(() => {
    async function fetchUserData() {
      if (!user) return;
      setDisplayName(user.displayName || '');
      setRealName(user.displayName || '');
      setAvatarUrl(safeAvatar(null, user.uid));

      try {
        // Sync & calculate latest gamification stats from Firestore user_books
        const syncedStats = await syncUserGamificationStats(user.uid);
        setStats(syncedStats);
        setBadges(calculateBadges(syncedStats));

        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          if (data.displayName) setDisplayName(data.displayName);
          if (data.realName) setRealName(data.realName);
          setAvatarUrl(safeAvatar(data.avatarUrl, user.uid));
          if (data.magicalTitle) setMagicalTitle(data.magicalTitle);
          if (data.favoriteGenres) setFavoriteGenres(data.favoriteGenres);
          if (data.bio) setBio(data.bio);
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
      }
    }
    fetchUserData();
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      // Update Firestore user document
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        avatarUrl: safeAvatar(avatarUrl, user.uid),
        realName,
        magicalTitle,
        favoriteGenres,
        bio,
        updatedAt: new Date()
      }, { merge: true });

      setSuccessMessage('Perfil atualizado com sucesso! ✨');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: any) {
      console.error(err);
      setError('Falha ao atualizar o perfil. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const presetAvatars = AVATAR_PRESETS;

  return (
    <div className="min-h-screen bg-background text-on-background pb-[100px] md:pb-0 relative overflow-x-hidden">
      {/* Background magical glow */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none opacity-30">
        <div className="absolute top-10 left-10 w-96 h-96 rounded-full bg-primary/20 blur-3xl animate-pulse"></div>
        <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-secondary/20 blur-3xl animate-pulse"></div>
      </div>

      <TopBar />

      <main className="max-w-4xl mx-auto px-4 py-8 relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <button 
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-primary hover:bg-surface-container-high transition-all shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="font-headline-lg text-primary flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-tertiary animate-spin" style={{ animationDuration: '6s' }} />
            Personalização do Perfil Mágico
          </h2>
        </div>

        {successMessage && (
          <div className="mb-6 p-4 bg-primary-container text-on-primary-container rounded-xl flex items-center gap-3 shadow-md slide-up">
            <Sparkles className="w-5 h-5 shrink-0" />
            <span className="font-body-md font-medium">{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-error-container text-on-error-container rounded-xl flex items-center gap-3 shadow-md">
            <span className="font-body-md">{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Left Column: Avatar & Stats Card */}
          <div className="md:col-span-1 space-y-6">
            <div className="bg-surface-container-lowest rounded-2xl p-6 border-2 border-primary-container shadow-lg flex flex-col items-center text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-r from-primary/20 via-secondary/20 to-tertiary/20"></div>
              
              <div className="relative z-10 mt-6 w-28 h-28 rounded-full overflow-hidden border-4 border-surface shadow-xl bg-primary-container mb-4 group">
                <img 
                  src={safeAvatar(avatarUrl, user?.uid)} 
                  alt="Avatar" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>

              <h3 className="font-headline-md text-primary font-bold mb-0.5">{displayName || 'Explorador(a) de Mundos'}</h3>
              <p className="font-body-xs text-on-surface-variant font-medium mb-2">Nome Real: <span className="text-on-surface">{realName || 'Não informado'}</span></p>
              <p className="font-label-md text-secondary px-3 py-1 bg-secondary-container/40 rounded-full mb-3 inline-block font-semibold">
                {magicalTitle}
              </p>
              <p className="font-body-xs text-on-surface-variant italic mb-6">
                {user?.email}
              </p>

              {/* Stats badges */}
              <div className="grid grid-cols-3 gap-2 w-full pt-4 border-t border-surface-variant">
                <div className="flex flex-col items-center p-2 rounded-xl bg-surface-container">
                  <Shield className="w-5 h-5 text-primary mb-1" />
                  <span className="font-label-sm text-on-surface-variant">Nível</span>
                  <span className="font-headline-sm text-primary font-bold">{stats.level}</span>
                </div>
                <div className="flex flex-col items-center p-2 rounded-xl bg-surface-container">
                  <Star className="w-5 h-5 text-tertiary mb-1" />
                  <span className="font-label-sm text-on-surface-variant">Estrelas</span>
                  <span className="font-headline-sm text-tertiary font-bold">{stats.stars}</span>
                </div>
                <div className="flex flex-col items-center p-2 rounded-xl bg-surface-container">
                  <Award className="w-5 h-5 text-secondary mb-1" />
                  <span className="font-label-sm text-on-surface-variant">XP</span>
                  <span className="font-headline-sm text-secondary font-bold">{stats.xp}</span>
                </div>
              </div>

              {/* Progress to next level */}
              <div className="w-full mt-4 pt-3 border-t border-surface-variant/60">
                <div className="flex justify-between items-center text-xs mb-1 font-semibold">
                  <span className="text-primary flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Nível {stats.level}</span>
                  <span className="text-on-surface-variant">{stats.xp % 150} / 150 XP p/ próx. nível</span>
                </div>
                <div className="w-full h-2.5 bg-surface-container-highest rounded-full overflow-hidden border border-surface-variant">
                  <div 
                    className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500 rounded-full"
                    style={{ width: `${Math.min(100, Math.round(((stats.xp % 150) / 150) * 100))}%` }}
                  />
                </div>
              </div>

              {/* Ranking Explanation Accordion/Card */}
              <div className="w-full mt-4 p-4 rounded-xl bg-primary-container/20 border border-primary-container/50 text-left space-y-2 text-xs">
                <div className="font-bold text-primary flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-tertiary" /> Como funciona o Ranking?</span>
                </div>
                <p className="text-on-surface-variant">
                  O seu **Nível**, **XP** e **Estrelas** são calculados automaticamente conforme você lê e participa da Magic Library:
                </p>
                <ul className="space-y-1.5 text-on-surface text-[11px] list-disc list-inside">
                  <li><strong>+20 XP:</strong> Por cada livro cadastrado na sua biblioteca</li>
                  <li><strong>+1 XP:</strong> Por cada página lida e registrada</li>
                  <li><strong>+100 XP:</strong> Bônus por concluir a leitura de um livro ("Lido")</li>
                  <li><strong>⭐️ Estrelas:</strong> Ganhe 1 estrela a cada livro lido, a cada 500 páginas lidas ou a cada 5 livros na biblioteca</li>
                  <li><strong>🛡️ Nível Mágico:</strong> Você sobe de nível a cada 150 XP acumulados!</li>
                </ul>
              </div>
            </div>

            {/* Quick Preset Avatars */}
            <div className="bg-surface-container-lowest rounded-2xl p-6 border border-surface-variant shadow-md">
              <h4 className="font-headline-sm text-primary mb-3 flex items-center gap-2">
                <Camera className="w-4 h-4" /> Avatares Mágicos Sugeridos
              </h4>
              <p className="font-body-xs text-on-surface-variant mb-4">Escolha o seu avatar e depois toque em Salvar Alterações:</p>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                {presetAvatars.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAvatarUrl(preset)}
                    className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-all p-1 bg-surface-container hover:scale-105 ${avatarUrl === preset ? 'border-primary ring-2 ring-primary/40 shadow-md' : 'border-surface-variant'}`}
                  >
                    <img src={preset} alt={`Avatar ${idx}`} className="w-full h-full object-cover rounded-lg" />
                  </button>
                ))}
              </div>
            </div>

{/* Badges Section */}
            <div className="bg-surface-container-lowest rounded-2xl p-6 border-2 border-primary-container shadow-lg flex flex-col mt-6">
              <h3 className="font-headline-sm text-primary font-bold mb-4 flex items-center gap-2">
                <Award className="w-5 h-5" /> Emblemas
              </h3>
              <div className="flex flex-col gap-3">
                {badges.map((badge) => {
                  const Icon = badge.iconType === 'book' ? Book :
                               badge.iconType === 'flame' ? Flame :
                               badge.iconType === 'timer' ? Timer :
                               badge.iconType === 'package' ? Package :
                               badge.iconType === 'crown' ? Crown : Award;
                  return (
                    <div key={badge.id} className={`flex items-center gap-4 p-3 rounded-xl border transition-all ${badge.achieved ? 'bg-primary-container/20 border-primary/30 shadow-sm' : 'bg-surface-container border-surface-variant opacity-60 grayscale'}`}>
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-sm ${badge.achieved ? 'bg-primary text-on-primary' : 'bg-surface-variant text-on-surface-variant'}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className={`font-label-lg font-bold ${badge.achieved ? 'text-primary' : 'text-on-surface-variant'}`}>{badge.name}</h4>
                          {badge.achieved && <Star className="w-3.5 h-3.5 text-tertiary fill-tertiary" />}
                        </div>
                        <p className="text-[11px] text-on-surface-variant leading-tight">{badge.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          
            {/* Right Column: Edit Profile Form */}
          <div className="md:col-span-2 space-y-6">
            <form onSubmit={handleSave} className="bg-surface-container-lowest rounded-2xl p-8 border-2 border-primary-container/60 shadow-xl space-y-6">
              <h3 className="font-headline-lg text-primary border-b border-surface-variant pb-3 flex items-center gap-2">
                <User className="w-5 h-5 text-primary" /> Editar Informações do Explorador(a) de Mundos
              </h3>

              <div>
                <label className="block font-label-md text-on-surface mb-2 flex items-center justify-between">
                  <span>Nome de Exibição (Exclusivo e Permanente)</span>
                  <span className="text-xs text-primary flex items-center gap-1 font-semibold">
                    <Lock className="w-3.5 h-3.5" /> Não alterável
                  </span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  disabled
                  className="w-full px-4 py-3 rounded-xl bg-surface-container text-on-surface-variant border border-surface-variant font-body-md cursor-not-allowed opacity-80"
                />
                <span className="font-body-xs text-on-surface-variant mt-1.5 block">
                  O nome de exibição é único em toda a plataforma e foi definido no momento do cadastro.
                </span>
              </div>

              <div>
                <label className="block font-label-md text-on-surface mb-2">Nome Real</label>
                <input
                  type="text"
                  value={realName}
                  onChange={(e) => setRealName(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-surface border border-surface-variant focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-body-md transition-all"
                  placeholder="Seu nome real"
                />
              </div>

              <div>
                <label className="block font-label-md text-on-surface mb-2">Título Mágico</label>
                <select
                  value={magicalTitle}
                  onChange={(e) => setMagicalTitle(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-surface border border-surface-variant focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-body-md transition-all"
                >
                  <option value="Explorador(a) de Mundos">Explorador(a) de Mundos</option>
                  <option value="Mestre dos Grimórios">Mestre dos Grimórios</option>
                  <option value="Guardião(ã) do Saber">Guardião(ã) do Saber</option>
                  <option value="Viajante dos Universos">Viajante dos Universos</option>
                  <option value="Arquivista Arcano">Arquivista Arcano</option>
                  <option value="Cavaleiro da Poesia">Cavaleiro da Poesia</option>
                </select>
              </div>

              <div>
                <label className="block font-label-md text-on-surface mb-2">Gêneros Literários Favoritos</label>
                <input
                  type="text"
                  value={favoriteGenres}
                  onChange={(e) => setFavoriteGenres(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-surface border border-surface-variant focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-body-md transition-all"
                  placeholder="Ex: Fantasia Épica, Ficção Científica, Mistério"
                />
              </div>

              <div>
                <label className="block font-label-md text-on-surface mb-2">Bio / Sobre Mim</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl bg-surface border border-surface-variant focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-body-md transition-all resize-none"
                  placeholder="Conte um pouco sobre suas jornadas literárias..."
                />
              </div>

              <div className="pt-4 border-t border-surface-variant flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-full bg-primary text-on-primary font-headline-sm font-bold shadow-lg hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                >
                  <Save className="w-5 h-5" />
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>

            {/* Clear / Reset Data Section */}
            <div className="bg-surface-container-lowest rounded-2xl p-6 border-2 border-error/30 shadow-lg space-y-4">
              <h3 className="font-headline-md text-error flex items-center gap-2 border-b border-surface-variant pb-3 font-bold">
                <AlertTriangle className="w-5 h-5 text-error" />
                Gerenciamento & Limpeza de Dados
              </h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Use a opção abaixo se quiser apagar os seus livros, trocas e progresso de leitura.
              </p>

              <div className="grid grid-cols-1 gap-4 pt-2">
                <button
                  type="button"
                  onClick={handleClearUserData}
                  disabled={isClearingData}
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-error/10 hover:bg-error/20 text-error font-label-lg font-bold border border-error/30 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isClearingData ? 'Limpando...' : 'Limpar Meus Dados'}</span>
                </button>

              </div>
            </div>
          </div>
        </div>
        <VersionBadge className="pb-4" />
      </main>

      <BottomNav />
    </div>
  );
}
