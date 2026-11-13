import { db } from './firebase';
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';

/**
 * Gamificação focada em LER (e não em cadastrar livros).
 *
 * Regras de XP (v2):
 *  - Cadastrar livro: 0 XP.
 *  - +1 XP por página lida (limitado ao total de páginas do livro).
 *  - Concluir um livro ("Lido"): +50 XP, mais 1 XP a cada 10 páginas do livro (bônus total máx. 100).
 *  - +30 XP pelo primeiro livro concluído de cada gênero novo.
 *
 * Níveis: o nível 2 começa em 150 XP e cada nível seguinte pede 50 XP a mais que o anterior
 * (150, 200, 250...). Limiares acumulados: 150, 350, 600, 900...
 *
 * Estrelas: 1 por livro concluído, 1 a cada 500 páginas lidas e 1 a cada 5 livros CONCLUÍDOS.
 *
 * Ficam para a Fase 2 (precisam de histórico por dia / novos dados): teto diário de XP,
 * bônus de dia e semana de leitura, registro de leitura, empréstimos e meta da turma.
 */

export const COMPLETION_BASE_XP = 50;
export const COMPLETION_MAX_XP = 100;
export const NEW_GENRE_XP = 30;

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  iconType: string;
  achieved: boolean;
  progress: number; // 0 to 1
}

export function calculateBadges(stats: GamificationStats): BadgeDef[] {
  return [
    {
      id: 'first_book',
      name: 'Primeiro Passo',
      description: 'Adicionou seu primeiro livro à biblioteca.',
      iconType: 'book',
      achieved: stats.totalBooks >= 1,
      progress: Math.min(1, stats.totalBooks / 1)
    },
    {
      id: 'avid_reader',
      name: 'Leitor Ávido',
      description: 'Terminou de ler 5 livros.',
      iconType: 'flame',
      achieved: stats.completedBooks >= 5,
      progress: Math.min(1, stats.completedBooks / 5)
    },
    {
      id: 'page_marathon',
      name: 'Maratonista',
      description: 'Leu 1.000 páginas ou mais.',
      iconType: 'timer',
      achieved: stats.totalPagesRead >= 1000,
      progress: Math.min(1, stats.totalPagesRead / 1000)
    },
    {
      id: 'living_shelf',
      name: 'Estante Viva',
      description: 'Tem 15 livros na estante, e pelo menos 5 já lidos.',
      iconType: 'package',
      achieved: stats.totalBooks >= 15 && stats.completedBooks >= 5,
      progress: Math.min(1, (Math.min(stats.totalBooks, 15) / 15 + Math.min(stats.completedBooks, 5) / 5) / 2)
    },
    {
      id: 'genre_explorer',
      name: 'Explorador de Gêneros',
      description: 'Terminou livros de 4 gêneros diferentes.',
      iconType: 'compass',
      achieved: stats.genresCompleted >= 4,
      progress: Math.min(1, stats.genresCompleted / 4)
    },
    {
      id: 'wisdom_master',
      name: 'Mestre da Sabedoria',
      description: 'Alcançou o Nível 5 de exploração.',
      iconType: 'crown',
      achieved: stats.level >= 5,
      progress: Math.min(1, stats.level / 5)
    }
  ];
}

export interface GamificationStats {
  level: number;
  xp: number;
  stars: number;
  totalBooks: number;
  completedBooks: number;
  totalPagesRead: number;
  genresCompleted: number;
}

export const EMPTY_STATS: GamificationStats = {
  level: 1, xp: 0, stars: 0, totalBooks: 0, completedBooks: 0, totalPagesRead: 0, genresCompleted: 0
};

export interface LevelInfo {
  level: number;
  /** XP acumulado dentro do nível atual. */
  xpIntoLevel: number;
  /** XP necessário para sair do nível atual. */
  xpForNext: number;
  /** Porcentagem (0-100) de progresso dentro do nível. */
  progressPct: number;
}

/** XP acumulado necessário para ALCANÇAR o nível n (nível 1 = 0). */
function levelStartXp(n: number): number {
  if (n <= 1) return 0;
  return 100 * (n - 1) + 25 * n * (n - 1); // 150, 350, 600, 900...
}

export function getLevelInfo(xp: number): LevelInfo {
  const safeXp = Math.max(0, Math.floor(xp) || 0);
  let level = 1;
  while (levelStartXp(level + 1) <= safeXp) level++;
  const start = levelStartXp(level);
  const xpForNext = levelStartXp(level + 1) - start;
  const xpIntoLevel = safeXp - start;
  return {
    level,
    xpIntoLevel,
    xpForNext,
    progressPct: Math.min(100, Math.round((xpIntoLevel / xpForNext) * 100))
  };
}

export interface UserBookInput {
  status?: string;
  pagesRead?: number;
  totalPages?: number;
  category?: string;
  bookDetails?: { totalPages?: number; category?: string } | null;
}

/**
 * Calcula as estatísticas a partir dos livros do usuário.
 * Aceita `totalPages`/`category` direto no item ou dentro de `bookDetails` (como o Dashboard monta).
 */
export function calculateStatsFromBooks(userBooks: UserBookInput[]): GamificationStats {
  const totalBooks = userBooks.length;
  let completedBooks = 0;
  let totalPagesRead = 0;
  let pageXp = 0;
  let completionXp = 0;
  const genres = new Set<string>();

  for (const b of userBooks) {
    const total = Number(b.totalPages ?? b.bookDetails?.totalPages) || 0;
    const rawRead = Math.max(0, Number(b.pagesRead) || 0);
    // Não conta mais páginas do que o livro tem (evita digitar 9999 para ganhar XP)
    const read = total > 0 ? Math.min(rawRead, total) : rawRead;

    totalPagesRead += read;
    pageXp += read;

    if (b.status === 'Lido') {
      completedBooks++;
      completionXp += Math.min(COMPLETION_MAX_XP, COMPLETION_BASE_XP + Math.floor(total / 10));
      const genre = String(b.category ?? b.bookDetails?.category ?? '').trim().toLowerCase();
      if (genre) genres.add(genre);
    }
  }

  const genresCompleted = genres.size;
  const xp = pageXp + completionXp + genresCompleted * NEW_GENRE_XP;

  const stars = completedBooks + Math.floor(totalPagesRead / 500) + Math.floor(completedBooks / 5);
  const level = getLevelInfo(xp).level;

  return { level, xp, stars, totalBooks, completedBooks, totalPagesRead, genresCompleted };
}

/**
 * Fetches user's books from Firestore, recalculates stats, and syncs them to users/{userId}
 */
export async function syncUserGamificationStats(userId: string): Promise<GamificationStats> {
  try {
    const q = query(collection(db, 'user_books'), where('userId', '==', userId));
    const snap = await getDocs(q);

    // user_books guarda só o vínculo; total de páginas e gênero ficam em 'books'.
    const joined = await Promise.all(
      snap.docs.map(async d => {
        const ub = d.data() as UserBookInput & { bookId?: string };
        try {
          const bookSnap = ub.bookId ? await getDoc(doc(db, 'books', ub.bookId)) : null;
          if (!bookSnap || !bookSnap.exists()) return null; // vínculo órfão
          const bd = bookSnap.data() as { totalPages?: number; category?: string };
          return { ...ub, totalPages: bd.totalPages, category: bd.category } as UserBookInput;
        } catch {
          return ub as UserBookInput;
        }
      })
    );
    const userBooks = joined.filter((b): b is UserBookInput => b !== null);

    const stats = calculateStatsFromBooks(userBooks);

    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      level: stats.level,
      xp: stats.xp,
      stars: stats.stars,
      updatedAt: new Date()
    }, { merge: true });

    return stats;
  } catch (err) {
    console.error('Error syncing user gamification stats:', err);
    return { ...EMPTY_STATS };
  }
}
