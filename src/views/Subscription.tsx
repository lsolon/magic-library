import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Sparkles, Star, Zap, Crown, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { authFetch } from '../lib/api';
import { TopBar } from '../components/TopBar';
import { BottomNav } from '../components/BottomNav';

export default function Subscription() {
  const { user, isTrialExpired, trialDaysLeft, isSubscribed } = useAuth();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string>('');

  const handleSubscribe = async (plan: 'monthly' | 'annual') => {
    if (!user) return;
    setLoadingPlan(plan);
    setError('');

    try {
      const res = await authFetch('api/create-preference', { plan });

      if (!res.ok) {
        throw new Error('Falha ao processar pagamento');
      }

      const data = await res.json();
      if (data.init_point) {
        // Redireciona para o checkout do Mercado Pago
        window.location.href = data.init_point;
      }
    } catch (err: any) {
      console.error(err);
      setError('Ocorreu um erro ao gerar o pagamento. Tente novamente mais tarde.');
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-6">
      <TopBar title="Planos Mágicos" />

      <main className="pt-24 px-6 max-w-4xl mx-auto space-y-8">
        
        {/* Dynamic Banner */}
        {isSubscribed ? (
          <div className="bg-tertiary-container/20 border-2 border-tertiary/40 rounded-3xl p-6 text-center shadow-lg relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-tertiary/30 rounded-full blur-xl pointer-events-none"></div>
            <Crown className="w-12 h-12 text-tertiary mx-auto mb-4 float-anim" />
            <h2 className="text-3xl font-bold text-on-surface mb-2">Você é um Assinante!</h2>
            <p className="text-lg text-on-surface-variant font-medium max-w-lg mx-auto">
              Obrigado por apoiar a Magic Library! Seu passe livre para explorar todos os mundos literários já está ativo.
            </p>
          </div>
        ) : isTrialExpired ? (
          <div className="bg-error-container/20 border-2 border-error/40 rounded-3xl p-6 text-center shadow-lg relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-error/30 rounded-full blur-xl pointer-events-none"></div>
            <AlertTriangle className="w-12 h-12 text-error mx-auto mb-4 pulse-anim" />
            <h2 className="text-3xl font-bold text-on-surface mb-2">Seu tempo gratuito expirou</h2>
            <p className="text-lg text-on-surface-variant font-medium max-w-lg mx-auto">
              Para continuar usando a Bússola Mágica, salvar mais livros e fazer trocas P2P, escolha um dos planos abaixo.
            </p>
          </div>
        ) : (
          <div className="bg-primary/20 border-2 border-primary/40 rounded-3xl p-6 text-center shadow-lg relative overflow-hidden group">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/30 rounded-full blur-xl pointer-events-none"></div>
            <Sparkles className="w-12 h-12 text-primary mx-auto mb-4 float-anim" />
            <h2 className="text-3xl font-bold text-on-surface mb-2">
              {trialDaysLeft} {trialDaysLeft === 1 ? 'Dia' : 'Dias'} de Magia Restante{trialDaysLeft === 1 ? '' : 's'}
            </h2>
            <p className="text-lg text-on-surface-variant font-medium max-w-lg mx-auto">
              Aproveite os dias restantes do seu teste de 30 Dias! Depois disso, você precisará escolher um plano para continuar sua jornada.
            </p>
          </div>
        )}

        <div className="text-center">
          <h1 className="text-3xl md:text-4xl font-headline-xl text-primary mb-4">Escolha seu Caminho Mágico</h1>
          <p className="text-on-surface-variant text-lg">Continue sua jornada literária com acesso ilimitado.</p>
        </div>

        {error && (
          <div className="bg-error-container/20 border border-error/50 text-error p-4 rounded-xl text-center">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-8 mt-8">
          
          {/* Plano Mensal */}
          <div className="bg-surface-container-low border-2 border-surface-variant rounded-3xl p-8 flex flex-col hover:border-primary transition-colors shadow-sm relative">
            <h3 className="text-2xl font-bold text-on-surface flex items-center gap-2">
              <Star className="text-secondary" /> Mago Aprendiz
            </h3>
            <p className="text-on-surface-variant mt-2 mb-6">Plano Mensal</p>
            <div className="text-4xl font-bold text-primary mb-6">
              R$ 18,00<span className="text-lg text-on-surface-variant font-medium">/mês</span>
            </div>
            <ul className="space-y-4 mb-8 flex-1 text-on-surface">
              <li className="flex items-center gap-3"><Check className="text-tertiary w-5 h-5 flex-shrink-0" /> Livros ilimitados na estante</li>
              <li className="flex items-center gap-3"><Check className="text-tertiary w-5 h-5 flex-shrink-0" /> Inteligência Artificial (5/dia)</li>
              <li className="flex items-center gap-3"><Check className="text-tertiary w-5 h-5 flex-shrink-0" /> Avatares Mágicos Gerados</li>
              <li className="flex items-center gap-3"><Check className="text-tertiary w-5 h-5 flex-shrink-0" /> Trocas P2P de livros</li>
            </ul>
            <button 
              onClick={() => handleSubscribe('monthly')}
              disabled={loadingPlan !== null}
              className="w-full bg-surface-container-high text-on-surface font-bold py-4 rounded-2xl border-2 border-surface-variant hover:bg-primary hover:text-on-primary hover:border-primary transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loadingPlan === 'monthly' ? (
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
              ) : (
                'Assinar Mensal'
              )}
            </button>
          </div>

          {/* Plano Anual */}
          <div className="bg-surface-container-highest border-2 border-primary rounded-3xl p-8 flex flex-col magic-shadow relative transform hover:-translate-y-2 transition-all">
            <div className="absolute top-0 right-0 bg-primary text-on-primary text-xs font-bold px-4 py-1.5 rounded-bl-xl rounded-tr-3xl uppercase tracking-wider">
              15% Off
            </div>
            <h3 className="text-2xl font-bold text-on-surface flex items-center gap-2">
              <Crown className="text-secondary-container" /> Grão-Mestre
            </h3>
            <p className="text-on-surface-variant mt-2 mb-6">Plano Anual</p>
            <div className="text-4xl font-bold text-primary mb-2">
              R$ 183,60<span className="text-lg text-on-surface-variant font-medium">/ano</span>
            </div>
            <p className="text-sm text-on-surface-variant font-medium mb-6">Equivale a apenas R$ 15,30/mês</p>
            <ul className="space-y-4 mb-8 flex-1 text-on-surface">
              <li className="flex items-center gap-3"><Check className="text-tertiary w-5 h-5 flex-shrink-0" /> Todos os recursos do Mensal</li>
              <li className="flex items-center gap-3"><Check className="text-tertiary w-5 h-5 flex-shrink-0" /> Símbolo Exclusivo de Grão-Mestre</li>
              <li className="flex items-center gap-3"><Check className="text-tertiary w-5 h-5 flex-shrink-0" /> Destaque nas Trocas P2P</li>
              <li className="flex items-center gap-3"><Check className="text-tertiary w-5 h-5 flex-shrink-0" /> 15% de desconto (2 meses grátis)</li>
            </ul>
            <button 
              onClick={() => handleSubscribe('annual')}
              disabled={loadingPlan !== null}
              className="w-full bg-primary text-on-primary font-bold py-4 rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loadingPlan === 'annual' ? (
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <Zap className="w-5 h-5" /> Assinar Anual
                </>
              )}
            </button>
          </div>

        </div>
        
        <div className="text-center pt-8 pb-4">
           <p className="text-sm text-on-surface-variant">Pagamento seguro processado via Mercado Pago.</p>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
