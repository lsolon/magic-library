/**
 * Perfis por faixa escolar. Um único app; o que muda é a configuração:
 * tema (index.css, via data-band), textos, funcionalidades ligadas e a tela inicial.
 *
 * A faixa é definida pelo administrador (futuramente professor/escola), nunca pelo aluno.
 * Mantenha a lista de ids igual a BANDS em firestore.rules.
 */
export type BandId = 'fund1' | 'fund2' | 'medio';

export const BAND_IDS: BandId[] = ['fund1', 'fund2', 'medio'];

/** Faixa usada quando o usuário ainda não tem faixa definida. */
export const DEFAULT_BAND: BandId = 'fund2';

export interface BandConfig {
  id: BandId;
  label: string;
  grades: string;
  copy: {
    greeting: (name: string) => string;
    subtitle: string;
    missionTitle: string;
    missionWithBook: (title: string) => string;
    missionNoBook: string;
    missionCta: string;
    missionCtaEmpty: string;
    progressTitle: string;
    shelfTitle: string;
    shelfAdd: string;
    navHome: string;
  };
  features: {
    /** Mapa de aventura com nós; no médio dá lugar ao painel de estatísticas. */
    adventureMap: boolean;
    /** Painel "seu progresso" com números (livros, páginas, XP). */
    statsPanel: boolean;
    /** Cartão de missão colorido e animado. */
    playfulHero: boolean;
  };
}

export const BANDS: Record<BandId, BandConfig> = {
  fund1: {
    id: 'fund1',
    label: 'Fundamental I',
    grades: '1º ao 5º ano',
    copy: {
      greeting: n => `Olá, ${n}! 🦉`,
      subtitle: 'Pronto para uma nova aventura mágica hoje?',
      missionTitle: 'Missão do Dia',
      missionWithBook: t => `Leia mais um pouco de "${t}" e ganhe poeira estelar!`,
      missionNoBook: 'Adicione um novo livro à sua estante para começar sua jornada!',
      missionCta: 'Continuar Aventura',
      missionCtaEmpty: 'Começar Aventura',
      progressTitle: 'Mapa da Aventura',
      shelfTitle: 'Livros Mágicos',
      shelfAdd: 'Explorar Mais',
      navHome: 'Mapa',
    },
    features: { adventureMap: true, statsPanel: false, playfulHero: true },
  },
  fund2: {
    id: 'fund2',
    label: 'Fundamental II',
    grades: '6º ao 9º ano',
    copy: {
      greeting: n => `E aí, ${n}!`,
      subtitle: 'Bora ler hoje? Suba de nível e desbloqueie conquistas.',
      missionTitle: 'Desafio do Dia',
      missionWithBook: t => `Avance em "${t}" e some XP para o próximo nível.`,
      missionNoBook: 'Escolha um livro e comece seu primeiro desafio.',
      missionCta: 'Continuar leitura',
      missionCtaEmpty: 'Escolher livro',
      progressTitle: 'Sua Jornada',
      shelfTitle: 'Minha Estante',
      shelfAdd: 'Adicionar livro',
      navHome: 'Jornada',
    },
    features: { adventureMap: true, statsPanel: true, playfulHero: true },
  },
  medio: {
    id: 'medio',
    label: 'Ensino Médio',
    grades: '1ª a 3ª série',
    copy: {
      greeting: n => `Olá, ${n}`,
      subtitle: 'Qual é a leitura de hoje?',
      missionTitle: 'Leitura de hoje',
      missionWithBook: t => `Continue "${t}" de onde parou.`,
      missionNoBook: 'Adicione um livro à sua estante para acompanhar seu progresso.',
      missionCta: 'Continuar lendo',
      missionCtaEmpty: 'Adicionar livro',
      progressTitle: 'Seu progresso',
      shelfTitle: 'Minha estante',
      shelfAdd: 'Adicionar livro',
      navHome: 'Início',
    },
    features: { adventureMap: false, statsPanel: true, playfulHero: false },
  },
};

export function parseBand(raw: unknown): BandId {
  return typeof raw === 'string' && (BAND_IDS as string[]).includes(raw) ? (raw as BandId) : DEFAULT_BAND;
}

export function getBand(raw: unknown): BandConfig {
  return BANDS[parseBand(raw)];
}
