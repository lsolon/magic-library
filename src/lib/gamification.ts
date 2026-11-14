import { db } from './firebase';
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';

/**
 * Gamificação focada em LER (e não em cadastrar livros) — regras v3.
 *
 * XP:
 *  - Cadastrar livro: 0 XP.
 *  - Páginas: +1 XP por página lida, com teto de 50 XP de páginas por dia.
 *  - Dia de leitura (>= 10 páginas no dia): +10 XP.
 *  - Semana constante (>= 4 dias de leitura na semana, seg-dom): +30 XP.
 *  - Concluir um livro COM registro de leitura: +50 XP, mais 1 XP a cada 10 páginas do livro
 *    (bônus total máx. 100). No máximo 2 conclusões com bônus por dia.
 *  - +30 XP pelo primeiro livro concluído (com registro) de cada gênero novo.
 *  - Empréstimo concluído (devolução confirmada): +15 XP, até 2 por mês.
 *
 * Níveis: o nível 2 começa em 150 XP e cada nível seguinte pede 50 XP a mais (150, 350, 600, 900...).
 * Estrelas: 1 por livro concluído com registro, 1 a cada 500 páginas e 1 a cada 5 livros concluídos.
 *
 * Dados novos (coleções do Firestore):
 *  - reading_logs:    { userId, bookId, day, pages }  -> páginas lidas em cada dia (só cresce)
 *  - reading_records: { userId, bookId, rating, feeling, note, day } -> registro de leitura (privado)
 *
 * Compatibilidade: páginas de usuários antigos, sem log por dia, contam como "legado" (sem teto),
 * para ninguém perder XP já conquistado. Se as coleções novas ainda não estiverem liberadas nas
 * regras do Firestore, o app continua funcionando (sem teto diário e sem bônus de conclusão).
 */

export const DAILY_PAGE_XP_CAP = 50;
export const READING_DAY_MIN_PAGES = 10;
export const READING_DAY_XP = 10;
export const WEEK_MIN_DAYS = 4;
export const WEEK_XP = 30;
export const COMPLETION_BASE_XP = 50;
export const COMPLETION_MAX_XP = 100;
export const MAX_COMPLETIONS_PER_DAY = 2;
export const NEW_GENRE_XP = 30;
export const LOAN_XP = 15;
export const MAX_LOANS_PER_MONTH = 2;

const TZ = 'America/Sao_Paulo';

/** Dia (AAAA-MM-DD) no fuso de Brasília. */
export function dayKey(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: TZ });
}

/** Segunda-feira (AAAA-MM-DD) da semana de um dia. */
export function weekStart(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // segunda = 0
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

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
      id: 'steady_reader',
      name: 'Leitor Constante',
      description: 'Leu em pelo menos 4 dias por semana, durante 4 semanas seguidas.',
      iconType: 'calendar',
      achieved: stats.bestWeekStreak >= 4,
      progress: Math.min(1, stats.bestWeekStreak / 4)
    },
    {
      id: 'swap_partner',
      name: 'Parceiro de Troca',
      description: 'Concluiu 3 empréstimos de livros com os colegas.',
      iconType: 'handshake',
      achieved: stats.loansCompleted >= 3,
      progress: Math.min(1, stats.loansCompleted / 3)
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
  /** Livros concluídos que já têm registro de leitura (os que valem bônus). */
  recordedBooks: number;
  totalPagesRead: number;
  genresCompleted: number;
  /** Dias com leitura (>= 10 páginas) na semana atual. */
  daysThisWeek: number;
  /** Maior sequência de semanas constantes (>= 4 dias de leitura). */
  bestWeekStreak: number;
  loansCompleted: number;
}

export const EMPTY_STATS: GamificationStats = {
  level: 1, xp: 0, stars: 0, totalBooks: 0, completedBooks: 0, recordedBooks: 0,
  totalPagesRead: 0, genresCompleted: 0, daysThisWeek: 0, bestWeekStreak: 0, loansCompleted: 0
};

export interface ReadingLog { bookId: string; day: string; pages: number }
export interface ReadingRecordLite { bookId: string; day: string }
export interface LoanDone { month: string }

export interface Activity {
  logs: ReadingLog[];
  records: ReadingRecordLite[];
  loans: LoanDone[];
}

export const EMPTY_ACTIVITY: Activity = { logs: [], records: [], loans: [] };

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
  bookId?: string;
  status?: string;
  pagesRead?: number;
  totalPages?: number;
  category?: string;
  bookDetails?: { totalPages?: number; category?: string } | null;
}

/**
 * Calcula as estatísticas a partir dos livros e da atividade do usuário.
 * Aceita `totalPages`/`category` direto no item ou dentro de `bookDetails` (como o Dashboard monta).
 */
export function calculateStatsFromBooks(
  userBooks: UserBookInput[],
  activity: Activity = EMPTY_ACTIVITY,
  today: string = dayKey()
): GamificationStats {
  const totalBooks = userBooks.length;
  const bookIds = new Set(userBooks.map(b => b.bookId).filter(Boolean) as string[]);

  // Só contam logs/registros de livros que ainda estão na estante.
  const logs = activity.logs.filter(l => bookIds.has(l.bookId));
  const recordByBook = new Map<string, string>();
  activity.records.forEach(r => { if (bookIds.has(r.bookId)) recordByBook.set(r.bookId, r.day); });

  const loggedByBook = new Map<string, number>();
  const pagesByDay = new Map<string, number>();
  for (const l of logs) {
    const p = Math.max(0, Number(l.pages) || 0);
    loggedByBook.set(l.bookId, (loggedByBook.get(l.bookId) || 0) + p);
    pagesByDay.set(l.day, (pagesByDay.get(l.day) || 0) + p);
  }

  let completedBooks = 0;
  let totalPagesRead = 0;
  let legacyPagesXp = 0;
  const completions: Array<{ day: string; bonus: number; genre: string }> = [];

  for (const b of userBooks) {
    const total = Number(b.totalPages ?? b.bookDetails?.totalPages) || 0;
    const rawRead = Math.max(0, Number(b.pagesRead) || 0);
    // Não conta mais páginas do que o livro tem (evita digitar 9999 para ganhar XP)
    const read = total > 0 ? Math.min(rawRead, total) : rawRead;
    totalPagesRead += read;

    // Páginas sem log por dia (usuários antigos): contam sem teto diário.
    const logged = b.bookId ? (loggedByBook.get(b.bookId) || 0) : 0;
    legacyPagesXp += Math.max(0, read - logged);

    if (b.status === 'Lido') {
      completedBooks++;
      const recDay = b.bookId ? recordByBook.get(b.bookId) : undefined;
      if (recDay) {
        completions.push({
          day: recDay,
          bonus: Math.min(COMPLETION_MAX_XP, COMPLETION_BASE_XP + Math.floor(total / 10)),
          genre: String(b.category ?? b.bookDetails?.category ?? '').trim().toLowerCase()
        });
      }
    }
  }

  // Páginas com log: teto diário.
  let loggedPagesXp = 0;
  const readingDays: string[] = [];
  pagesByDay.forEach((pages, day) => {
    loggedPagesXp += Math.min(DAILY_PAGE_XP_CAP, pages);
    if (pages >= READING_DAY_MIN_PAGES) readingDays.push(day);
  });
  const readingDayXp = readingDays.length * READING_DAY_XP;

  // Semanas constantes
  const daysPerWeek = new Map<string, number>();
  readingDays.forEach(d => {
    const w = weekStart(d);
    daysPerWeek.set(w, (daysPerWeek.get(w) || 0) + 1);
  });
  const steadyWeeks = Array.from(daysPerWeek.entries())
    .filter(([, n]) => n >= WEEK_MIN_DAYS).map(([w]) => w).sort();
  const weekXp = steadyWeeks.length * WEEK_XP;
  let bestWeekStreak = 0;
  let run = 0;
  steadyWeeks.forEach((w, i) => {
    run = i > 0 && daysBetween(steadyWeeks[i - 1], w) === 7 ? run + 1 : 1;
    bestWeekStreak = Math.max(bestWeekStreak, run);
  });
  const daysThisWeek = daysPerWeek.get(weekStart(today)) || 0;

  // Conclusões com registro: no máximo 2 por dia
  let completionXp = 0;
  const byDay = new Map<string, number>();
  const genres = new Set<string>();
  completions.sort((a, b) => a.day.localeCompare(b.day) || b.bonus - a.bonus).forEach(c => {
    const n = byDay.get(c.day) || 0;
    if (n >= MAX_COMPLETIONS_PER_DAY) return;
    byDay.set(c.day, n + 1);
    completionXp += c.bonus;
    if (c.genre) genres.add(c.genre);
  });
  const recordedBooks = completions.length;
  const genresCompleted = genres.size;

  // Empréstimos concluídos: até 2 por mês
  const loansPerMonth = new Map<string, number>();
  activity.loans.forEach(l => loansPerMonth.set(l.month, (loansPerMonth.get(l.month) || 0) + 1));
  let loanXp = 0;
  loansPerMonth.forEach(n => { loanXp += Math.min(MAX_LOANS_PER_MONTH, n) * LOAN_XP; });

  const xp = legacyPagesXp + loggedPagesXp + readingDayXp + weekXp + completionXp
    + genresCompleted * NEW_GENRE_XP + loanXp;

  const stars = recordedBooks + Math.floor(totalPagesRead / 500) + Math.floor(recordedBooks / 5);
  const level = getLevelInfo(xp).level;

  return {
    level, xp, stars, totalBooks, completedBooks, recordedBooks, totalPagesRead,
    genresCompleted, daysThisWeek, bestWeekStreak, loansCompleted: activity.loans.length
  };
}

/**
 * Carrega a atividade do usuário (log diário, registros de leitura e empréstimos concluídos).
 * Cada consulta falha sozinha: se algo não estiver liberado, o app segue funcionando.
 */
export async function loadActivity(userId: string): Promise<Activity> {
  const safe = async (fn: () => Promise<any>) => { try { return await fn(); } catch (e) { console.warn('loadActivity:', e); return null; } };

  const [logsSnap, recSnap, exInit, exRecv] = await Promise.all([
    safe(() => getDocs(query(collection(db, 'reading_logs'), where('userId', '==', userId)))),
    safe(() => getDocs(query(collection(db, 'reading_records'), where('userId', '==', userId)))),
    safe(() => getDocs(query(collection(db, 'exchanges'), where('initiatorId', '==', userId), where('status', '==', 'completed')))),
    safe(() => getDocs(query(collection(db, 'exchanges'), where('receiverId', '==', userId), where('status', '==', 'completed'))))
  ]);

  const logs: ReadingLog[] = (logsSnap?.docs ?? []).map((d: any) => {
    const x = d.data();
    return { bookId: x.bookId, day: x.day, pages: Number(x.pages) || 0 };
  }).filter((l: ReadingLog) => l.bookId && l.day);

  const records: ReadingRecordLite[] = (recSnap?.docs ?? []).map((d: any) => {
    const x = d.data();
    return { bookId: x.bookId, day: x.day };
  }).filter((r: ReadingRecordLite) => r.bookId && r.day);

  const loansSeen = new Set<string>();
  const loans: LoanDone[] = [];
  [...(exInit?.docs ?? []), ...(exRecv?.docs ?? [])].forEach((d: any) => {
    if (loansSeen.has(d.id)) return;
    loansSeen.add(d.id);
    const x = d.data();
    const t = x.completedAt ?? x.updatedAt;
    const date: Date = t?.toDate ? t.toDate() : new Date();
    loans.push({ month: dayKey(date).slice(0, 7) });
  });

  return { logs, records, loans };
}

/**
 * Fetches user's books from Firestore, recalculates stats, and syncs them to users/{userId}
 */
export async function syncUserGamificationStats(userId: string): Promise<GamificationStats> {
  try {
    const q = query(collection(db, 'user_books'), where('userId', '==', userId));
    const [snap, activity] = await Promise.all([getDocs(q), loadActivity(userId)]);

    // user_books guarda só o vínculo; total de páginas e gênero ficam em 'books'.
    const joined = await Promise.all(
      snap.docs.map(async d => {
        const ub = d.data() as UserBookInput;
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

    const stats = calculateStatsFromBooks(userBooks, activity);

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
