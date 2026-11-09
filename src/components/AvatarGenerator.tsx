import React, { useState } from 'react';
import { authFetch } from '../lib/api';
import { Sparkles, Dice5, Upload, Wand2, AlertTriangle, Palette, Image as ImageIcon, Trash2, CheckCircle2 } from 'lucide-react';

interface AvatarGeneratorProps {
  currentAvatarUrl: string;
  savedAvatars: string[];
  onSelectAvatar: (url: string) => void;
  onSaveAvatar: (url: string) => void;
  onDeleteSavedAvatar?: (url: string) => void;
}

export function AvatarGenerator({ 
  currentAvatarUrl, 
  savedAvatars, 
  onSelectAvatar, 
  onSaveAvatar,
  onDeleteSavedAvatar 
}: AvatarGeneratorProps) {
  const [activeTab, setActiveTab] = useState<'ai' | 'presets' | 'upload' | 'gallery'>('presets');
  
  // Preset states
  const [seed, setSeed] = useState('magic-' + Math.random().toString(36).substring(2, 7));
  const [style, setStyle] = useState<'bottts' | 'avataaars' | 'lorelei' | 'pixel-art' | 'micah' | 'adventurer' | 'fun-emoji'>('adventurer');
  
  // AI states
  const [geminiPrompt, setGeminiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Upload states
  const [isValidating, setIsValidating] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const stylesList = [
    { id: 'adventurer', name: '🎮 Roblox / Aventura 3D' },
    { id: 'fun-emoji', name: '🤖 Blocos / Fun Emoji' },
    { id: 'lorelei', name: '🌍 Avatar World / Contos' },
    { id: 'avataaars', name: '👤 Personagens' },
    { id: 'pixel-art', name: '👾 Pixel Arcano' },
    { id: 'bottts', name: '🤖 Robôs Mágicos' }
  ];

  const getUrl = (s: string, st: string) => `https://api.dicebear.com/7.x/${st}/svg?seed=${encodeURIComponent(s)}`;

  const handleRandomizePreset = () => {
    const randomSeed = 'mago-' + Math.random().toString(36).substring(2, 9);
    setSeed(randomSeed);
    const finalUrl = getUrl(randomSeed, style);
    onSelectAvatar(finalUrl);
    onSaveAvatar(finalUrl);
    setErrorMsg('');
    setSuccessMsg('Avatar sorteado, aplicado e salvo no perfil! ✨');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleStyleChange = (newStyle: 'bottts' | 'avataaars' | 'lorelei' | 'pixel-art' | 'micah' | 'adventurer' | 'fun-emoji') => {
    setStyle(newStyle);
    const finalUrl = getUrl(seed, newStyle);
    onSelectAvatar(finalUrl);
    onSaveAvatar(finalUrl);
  };

  const handleSeedChange = (newSeed: string) => {
    setSeed(newSeed);
    if (newSeed.trim()) {
      const finalUrl = getUrl(newSeed, style);
      onSelectAvatar(finalUrl);
    }
  };

  const handleApplySeed = () => {
    if (!seed.trim()) return;
    const finalUrl = getUrl(seed, style);
    onSelectAvatar(finalUrl);
    onSaveAvatar(finalUrl);
    setSuccessMsg('Semente aplicada e salva no perfil! ✨');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleGeminiGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!geminiPrompt.trim()) return;

    setIsGenerating(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await authFetch('api/generate-gemini-avatar', { prompt: geminiPrompt });
      if (res.status === 429) {
        setErrorMsg('Você atingiu o limite de avatares por hoje. Tente novamente amanhã.');
        return;
      }
      const data = await res.json();
      if (data.avatarUrl) {
        onSelectAvatar(data.avatarUrl);
        onSaveAvatar(data.avatarUrl);
        setSuccessMsg('Avatar mágico gerado pelo Gemini e salvo no perfil! 🌟');
        setGeminiPrompt('');
        setTimeout(() => setSuccessMsg(''), 4000);
      } else {
        setErrorMsg('Falha ao gerar avatar com Gemini.');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao conectar com o Gemini.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg('');
    setSuccessMsg('');
    setIsValidating(true);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64String = (reader.result as string).split(',')[1];
        const mimeType = file.type || 'image/jpeg';

        try {
          const res = await authFetch('api/validate-avatar', { imageBase64: base64String, mimeType });
          const data = await res.json().catch(() => null);

          // Só aceita se a análise respondeu de verdade; qualquer falha recusa a imagem
          if (!res.ok || !data || typeof data.isRealPhoto !== 'boolean') {
            setErrorMsg(
              res.status === 429
                ? 'Você atingiu o limite de envios de imagem por hoje. Escolha um avatar pronto.'
                : 'Não foi possível validar a imagem agora. Tente de novo mais tarde ou escolha um avatar pronto.'
            );
          } else if (data.isRealPhoto) {
            setErrorMsg('⚠️ Fotos reais de pessoas não são permitidas! O reino mágico exige avatares ilustrados, desenhos ou avatares gerados por IA.');
          } else {
            const uploadedUrl = reader.result as string;
            onSelectAvatar(uploadedUrl);
            onSaveAvatar(uploadedUrl);
            setSuccessMsg('Avatar enviado, validado e salvo com sucesso! ✨');
            setTimeout(() => setSuccessMsg(''), 3000);
          }
        } catch (apiErr) {
          console.error(apiErr);
          // Falha de rede ou de login: não salva a imagem sem validação
          setErrorMsg('Não foi possível validar a imagem agora. Tente de novo mais tarde ou escolha um avatar pronto.');
        } finally {
          setIsValidating(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao ler o arquivo de imagem.');
      setIsValidating(false);
    }
  };

  return (
    <div className="bg-surface-container rounded-2xl p-6 border-2 border-primary-container/60 shadow-lg space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h4 className="font-headline-md text-primary flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-tertiary" /> Criação e Lista de Avatares Mágicos
          </h4>
          <p className="font-body-xs text-on-surface-variant mt-0.5">
            Crie, selecione ou gerencie sua lista de avatares (Roblox, Avatar World, Gemini IA).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-surface-container-highest p-1.5 rounded-xl border border-surface-variant">
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'presets' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface hover:text-primary'}`}
          >
            <Palette className="w-3.5 h-3.5" /> Estilos
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'ai' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface hover:text-primary'}`}
          >
            <Wand2 className="w-3.5 h-3.5" /> IA Gemini
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('gallery')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'gallery' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface hover:text-primary'}`}
          >
            <ImageIcon className="w-3.5 h-3.5" /> Lista ({savedAvatars.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'upload' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface hover:text-primary'}`}
          >
            <Upload className="w-3.5 h-3.5" /> Upload
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-error-container text-on-error-container rounded-xl flex items-start gap-3 text-sm shadow-md animate-shake">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-primary-container text-on-primary-container rounded-xl flex items-center gap-2 text-sm shadow-sm slide-up">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-primary" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        {/* Active Avatar preview */}
        <div className="flex flex-col items-center justify-center p-5 bg-surface-container-highest rounded-2xl border border-surface-variant">
          <div className="w-32 h-32 rounded-2xl overflow-hidden bg-primary-container/30 border-4 border-primary/40 shadow-xl flex items-center justify-center mb-3">
            <img 
              src={currentAvatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=magic'} 
              alt="Avatar Atual" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <span className="font-label-sm text-primary font-bold">✨ Avatar Ativo no Perfil</span>
          <span className="font-body-xs text-on-surface-variant text-center mt-1">Salvo automaticamente ao escolher</span>
        </div>

        {/* Tab Content Area */}
        <div className="md:col-span-2">
          {activeTab === 'presets' && (
            <div className="p-6 bg-surface-container-lowest rounded-2xl border border-surface-variant space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h5 className="font-headline-sm text-primary flex items-center gap-2">
                  <Palette className="w-5 h-5 text-tertiary" /> Estilos Prontos (Roblox, Avatar World & Arcanos)
                </h5>
                <button
                  type="button"
                  onClick={handleRandomizePreset}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-on-secondary font-headline-sm text-xs shadow-sm hover:scale-105 transition-all cursor-pointer"
                >
                  <Dice5 className="w-4 h-4" /> Sortear Rápido
                </button>
              </div>

              <div>
                <label className="block font-label-sm text-on-surface-variant mb-2">Selecione o Estilo Visual:</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {stylesList.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => handleStyleChange(st.id as any)}
                      className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border text-center cursor-pointer ${style === st.id ? 'bg-primary text-on-primary border-primary shadow-sm' : 'bg-surface text-on-surface border-surface-variant hover:border-primary/50'}`}
                    >
                      {st.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-label-sm text-on-surface-variant mb-1.5">Semente / Nome do Personagem</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={seed}
                    onChange={(e) => handleSeedChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplySeed();
                      }
                    }}
                    placeholder="Digite um nome (ex: MagoSupremo)..."
                    className="flex-1 px-3 py-2.5 rounded-xl bg-surface border border-surface-variant text-sm text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleApplySeed}
                    className="px-4 py-2.5 bg-secondary text-on-secondary rounded-xl font-headline-sm text-xs shadow-sm hover:bg-secondary/90 transition-all cursor-pointer shrink-0"
                  >
                    Aplicar Semente
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="p-6 bg-primary-container/20 rounded-2xl border-2 border-primary/30 space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h5 className="font-headline-sm text-primary flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-tertiary" /> Criação Independente com Gemini AI
                </h5>
                <span className="text-[10px] bg-primary text-on-primary px-2 py-0.5 rounded-full font-bold">100% Independente</span>
              </div>
              <p className="text-xs text-on-surface-variant">
                Descreva livremente o seu personagem mágico. O Gemini criará uma obra de arte única sem interferir nos estilos arcanos:
              </p>
              <form onSubmit={handleGeminiGenerate} className="space-y-3">
                <input 
                  type="text"
                  value={geminiPrompt}
                  onChange={(e) => setGeminiPrompt(e.target.value)}
                  placeholder="Ex: Mago cyberpunk com óculos neon flutuantes e cetro estelar..."
                  disabled={isGenerating}
                  className="w-full px-4 py-3 rounded-xl bg-surface border border-surface-variant text-sm text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
                <button
                  type="submit"
                  disabled={isGenerating || !geminiPrompt.trim()}
                  className="w-full py-3 bg-primary text-on-primary rounded-xl font-headline-sm text-xs shadow-md hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  {isGenerating ? 'Magia em andamento... (Gerando com Gemini)' : 'Gerar e Salvar Avatar com Gemini'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'gallery' && (
            <div className="p-6 bg-surface-container-lowest rounded-2xl border border-surface-variant space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h5 className="font-headline-sm text-primary flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-tertiary" /> Lista de Avatares Salvos ({savedAvatars.length})
                </h5>
                <span className="text-xs text-on-surface-variant">Clique para usar ou gerenciar</span>
              </div>

              {savedAvatars.length === 0 ? (
                <div className="text-center py-8 text-on-surface-variant text-xs">
                  Nenhum avatar salvo na sua lista ainda. Crie ou gere avatares para salvá-los aqui automaticamente!
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-60 overflow-y-auto p-1">
                  {savedAvatars.map((url, idx) => (
                    <div 
                      key={idx}
                      className={`relative group rounded-xl overflow-hidden border-2 transition-all p-1 bg-surface-container ${currentAvatarUrl === url ? 'border-primary ring-2 ring-primary/40 shadow-md' : 'border-surface-variant hover:border-primary/60'}`}
                    >
                      <img 
                        src={url} 
                        alt={`Avatar Salvo ${idx}`} 
                        className="w-full h-20 object-cover rounded-lg cursor-pointer"
                        onClick={() => {
                          onSelectAvatar(url);
                          setSuccessMsg('Avatar selecionado e aplicado!');
                          setTimeout(() => setSuccessMsg(''), 2500);
                        }}
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-x-1 bottom-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-surface/90 rounded-b-lg p-1">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectAvatar(url);
                            setSuccessMsg('Avatar aplicado!');
                            setTimeout(() => setSuccessMsg(''), 2500);
                          }}
                          className="flex-1 bg-primary text-on-primary text-[10px] font-bold py-1 rounded text-center"
                        >
                          Usar
                        </button>
                        {onDeleteSavedAvatar && (
                          <button
                            type="button"
                            onClick={() => onDeleteSavedAvatar(url)}
                            className="bg-error text-on-error p-1 rounded hover:bg-error/80"
                            title="Remover"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="p-6 bg-surface-container-lowest rounded-2xl border border-surface-variant space-y-4 animate-fadeIn">
              <h5 className="font-headline-sm text-primary flex items-center gap-2">
                <Upload className="w-5 h-5 text-tertiary" /> Enviar Imagem do Computador
              </h5>
              <p className="text-xs text-on-surface-variant">
                ⚠️ <strong className="text-error">Atenção:</strong> Fotos reais de pessoas ou selfies são estritamente proibidas para proteger sua identidade. Apenas ilustrações, desenhos, artes fantásticas ou logotipos são aceitos e validados por IA.
              </p>
              <input 
                type="file" 
                accept="image/*"
                onChange={handleFileUpload}
                disabled={isValidating}
                className="w-full text-xs text-on-surface-variant file:mr-4 file:py-3 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-primary-container file:text-on-primary-container hover:file:bg-primary-container/80 cursor-pointer disabled:opacity-50"
              />
              {isValidating && <p className="text-xs text-primary mt-2 animate-pulse flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> O Guardião IA está inspecionando a imagem enviada...</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
