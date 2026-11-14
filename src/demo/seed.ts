/** Dados fictícios do ambiente de demonstração (3 alunos, 1 turma, 6 livros). Sem dados reais. */
import { defaultAvatarFor } from '../lib/avatars';
import type { BandId } from '../lib/bands';

export interface DemoUser { uid: string; displayName: string; email: string; avatar: string; band: BandId; grade: string; role?: 'teacher' | 'student' }

const BASE_USERS: DemoUser[] = [
  { uid: 'ana', displayName: 'Ana', email: 'ana@demo.invalid', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=fenix', band: 'fund1', grade: '3º ano' },
  { uid: 'bruno', displayName: 'Bruno', email: 'bruno@demo.invalid', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=dragao', band: 'fund2', grade: '7º ano' },
  { uid: 'clara', displayName: 'Clara', email: 'clara@demo.invalid', avatar: 'https://api.dicebear.com/7.x/fun-emoji/svg?seed=coruja', band: 'medio', grade: '1ª série EM' },
];

// ---------------------------------------------------------------------------
// Escola Modelo (build /escola/): 1 professora + 8 alunos do 5º ano, só com nomes fictícios.
// ---------------------------------------------------------------------------
export const SCHOOL_NAME = 'Escola Modelo';
export const CLASS_ID = 'turma-5a';
export const CLASS_NAME = '5º ano A';

const STUDENT_DEFS: Array<{ uid: string; name: string; avatar: string; pattern: 'steady' | 'regular' | 'irregular' | 'paused' }> = [
  { uid: 'ana', name: 'Ana', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=fenix', pattern: 'steady' },
  { uid: 'bruno', name: 'Bruno', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=dragao', pattern: 'regular' },
  { uid: 'clara', name: 'Clara', avatar: 'https://api.dicebear.com/7.x/fun-emoji/svg?seed=coruja', pattern: 'steady' },
  { uid: 'davi', name: 'Davi', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=lobo', pattern: 'irregular' },
  { uid: 'elisa', name: 'Elisa', avatar: 'https://api.dicebear.com/7.x/big-smile/svg?seed=unicornio', pattern: 'regular' },
  { uid: 'felipe', name: 'Felipe', avatar: 'https://api.dicebear.com/7.x/lorelei/svg?seed=tigre', pattern: 'paused' },
  { uid: 'gabi', name: 'Gabi', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=estrela', pattern: 'steady' },
  { uid: 'heitor', name: 'Heitor', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=foguete', pattern: 'irregular' },
];

const SCHOOL_USERS: DemoUser[] = [
  { uid: 'prof', displayName: 'Profa. Marina', email: 'marina@demo.invalid', avatar: 'https://api.dicebear.com/7.x/lorelei/svg?seed=marina', band: 'fund1', grade: 'Professora', role: 'teacher' },
  ...STUDENT_DEFS.map(d => ({ uid: d.uid, displayName: d.name, email: `${d.uid}@demo.invalid`, avatar: d.avatar, band: 'fund1' as BandId, grade: '5º ano', role: 'student' as const })),
];

export const DEMO_USERS: DemoUser[] = __SCHOOL__ ? SCHOOL_USERS : BASE_USERS;

const BOOK_POOL: Array<{ t: string; a: string; c: string; d: string; p: number }> = [
  { t: 'O Pequeno Príncipe', a: 'Antoine de Saint-Exupéry', c: 'Contos de Fadas', d: 'Iniciante', p: 96 },
  { t: 'Peter Pan', a: 'J. M. Barrie', c: 'Aventura Épica', d: 'Aventureiro', p: 160 },
  { t: 'Alice no País das Maravilhas', a: 'Lewis Carroll', c: 'Fantasia', d: 'Aventureiro', p: 128 },
  { t: 'Reinações de Narizinho', a: 'Monteiro Lobato', c: 'Animais Fantásticos', d: 'Iniciante', p: 112 },
  { t: 'A Ilha do Tesouro', a: 'R. L. Stevenson', c: 'Aventura Épica', d: 'Mestre', p: 224 },
  { t: 'As Aventuras de Pinóquio', a: 'Carlo Collodi', c: 'Contos de Fadas', d: 'Iniciante', p: 144 },
  { t: 'Viagem ao Centro da Lua', a: 'Autora Fictícia', c: 'Espaço', d: 'Aventureiro', p: 180 },
  { t: 'O Segredo do Farol', a: 'Autor Fictício', c: 'Mistério', d: 'Aventureiro', p: 160 },
];
const NOTES = [
  'Gostei muito do final!', 'Quero ler a continuação.', 'A parte do mistério foi a melhor.', 'Chorei um pouquinho no fim.',
  'Meu personagem favorito é o protagonista.', 'Li rapidinho, não conseguia parar.', 'Aprendi palavras novas.', ''
];
const FEELINGS_IDS = ['emocionei', 'diverti', 'aprendi', 'curioso', 'tenso', 'inspirado'];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ts = { fromMillis(ms: number): any };

function buildSchoolSeed(Timestamp: Ts): Record<string, Record<string, any>> {
  const now = Date.now();
  const ts = (daysAgo = 0) => Timestamp.fromMillis(now - daysAgo * 86400000);
  const dayStr = (daysAgo: number) =>
    new Date(now - daysAgo * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const out: Record<string, Record<string, any>> = {};

  out['meta/seed'] = { day: dayStr(0) };
  out[`classes/${CLASS_ID}`] = {
    name: CLASS_NAME, school: SCHOOL_NAME, teacherId: 'prof',
    studentIds: STUDENT_DEFS.map(s => s.uid), goalBooks: 14
  };

  SCHOOL_USERS.forEach(u => {
    out[`users/${u.uid}`] = {
      displayName: u.displayName, realName: u.displayName, avatarUrl: u.avatar,
      magicalTitle: 'Explorador(a) de Mundos', favoriteGenres: 'Aventura, Mistério', bio: '',
      band: u.band, role: u.role, level: 1, xp: 0, stars: 0, isSubscribed: true, createdAt: ts(30)
    };
    out[`usernames/u_${encodeURIComponent(u.displayName.toLowerCase())}`] = { uid: u.uid, displayName: u.displayName };
  });

  STUDENT_DEFS.forEach((st, si) => {
    const r = rng(1000 + si * 77);
    // cada aluno começa por um livro diferente da lista
    const order = BOOK_POOL.map((_, i) => BOOK_POOL[(i + si * 2) % BOOK_POOL.length]);
    let bookIdx = 0;
    let readInBook = 0;
    let logN = 0;
    const created: Array<{ id: string; def: typeof BOOK_POOL[number]; pages: number; done: boolean }> = [];

    const ensureBook = (k: number) => {
      if (!created[k]) created[k] = { id: `b_${st.uid}_${k}`, def: order[k % order.length], pages: 0, done: false };
      return created[k];
    };
    const addLog = (k: number, day: number, pages: number) => {
      if (pages <= 0) return;
      const b = ensureBook(k);
      b.pages += pages;
      out[`reading_logs/l_${st.uid}_${logN++}`] = {
        userId: st.uid, bookId: b.id, day: dayStr(day), pages, createdAt: ts(day)
      };
    };

    for (let daysAgo = 20; daysAgo >= 0; daysAgo--) {
      const x = r();
      const reads =
        st.pattern === 'steady' ? x < 0.78 :
        st.pattern === 'regular' ? x < 0.5 :
        st.pattern === 'irregular' ? x < 0.22 :
        /* paused */ daysAgo >= 8 && x < 0.5;
      if (!reads) continue;
      let pages = 12 + Math.floor(r() * 26);
      while (pages > 0) {
        const b = ensureBook(bookIdx);
        const remaining = b.def.p - readInBook;
        if (pages >= remaining) {
          addLog(bookIdx, daysAgo, remaining);
          b.done = true;
          out[`reading_records/${st.uid}_${b.id}`] = {
            userId: st.uid, bookId: b.id, rating: 3 + Math.floor(r() * 3),
            feeling: FEELINGS_IDS[Math.floor(r() * FEELINGS_IDS.length)],
            note: NOTES[Math.floor(r() * NOTES.length)], day: dayStr(daysAgo), updatedAt: ts(daysAgo)
          };
          pages -= remaining; bookIdx++; readInBook = 0;
        } else {
          addLog(bookIdx, daysAgo, pages);
          readInBook += pages; pages = 0;
        }
      }
    }
    if (!created.length) ensureBook(0);

    created.forEach((b, k) => {
      const total = b.def.p;
      const pagesRead = b.done ? total : Math.min(b.pages, total);
      const shared = b.done && k % 2 === 0;
      out[`books/${b.id}`] = {
        title: b.def.t, author: b.def.a, category: b.def.c, difficulty: b.def.d,
        synopsis: 'Livro usado na demonstração.', totalPages: total, coverUrl: '',
        ownerId: st.uid, ownerName: st.name, currentReaderId: shared ? null : st.uid,
        currentReaderName: shared ? null : st.name, status: shared ? 'available' : 'reading_owner',
        pagesRead, addedBy: st.uid, addedAt: ts(22)
      };
      out[`user_books/ub_${st.uid}_${k}`] = {
        userId: st.uid, bookId: b.id, status: b.done ? 'Lido' : 'Lendo',
        progress: Math.round((pagesRead / total) * 100), pagesRead, maxPagesRead: pagesRead, addedAt: ts(22)
      };
    });
  });

  out[`clubs/${CLASS_ID}`] = {
    name: `${CLASS_NAME} · Biblioteca da Turma`, description: 'Livros compartilhados entre os alunos da turma (fictícia).',
    code: 'TURMA-5A', ownerId: 'ana', ownerName: 'Ana', members: STUDENT_DEFS.map(s => s.uid),
    memberDetails: STUDENT_DEFS.map(s => ({ uid: s.uid, displayName: s.name, avatarUrl: s.avatar })), createdAt: ts(25)
  };
  out['club_codes/TURMA-5A'] = { clubId: CLASS_ID, ownerId: 'ana' };
  return out;
}

export function buildSeed(Timestamp: Ts): Record<string, Record<string, any>> {
  return __SCHOOL__ ? buildSchoolSeed(Timestamp) : buildBaseSeed(Timestamp);
}

function buildBaseSeed(Timestamp: Ts): Record<string, Record<string, any>> {
  const now = Date.now();
  const ts = (daysAgo = 0) => Timestamp.fromMillis(now - daysAgo * 86400000);
  const out: Record<string, Record<string, any>> = {};

  BASE_USERS.forEach(u => {
    out[`users/${u.uid}`] = {
      displayName: u.displayName, realName: u.displayName, avatarUrl: u.avatar || defaultAvatarFor(u.uid),
      magicalTitle: 'Explorador(a) de Mundos', favoriteGenres: 'Aventura, Mistério', bio: '',
      band: u.band, level: 1, xp: 0, stars: 0, isSubscribed: true, createdAt: ts(2)
    };
    out[`usernames/u_${encodeURIComponent(u.displayName.toLowerCase())}`] = { uid: u.uid, displayName: u.displayName };
  });

  const book = (id: string, title: string, author: string, ownerId: string, category: string, difficulty: string,
    totalPages: number, status: string, readerId: string | null) => {
    const owner = BASE_USERS.find(u => u.uid === ownerId)!;
    out[`books/${id}`] = {
      title, author, category, difficulty, synopsis: 'Livro fictício para a demonstração.', totalPages, coverUrl: '',
      ownerId, ownerName: owner.displayName, currentReaderId: readerId,
      currentReaderName: readerId ? BASE_USERS.find(u => u.uid === readerId)!.displayName : null,
      status, pagesRead: status === 'available' ? totalPages : Math.round(totalPages * 0.4), addedBy: ownerId, addedAt: ts(5)
    };
  };
  const shelf = (id: string, userId: string, bookId: string, status: string, progress: number, pagesRead: number) => {
    out[`user_books/${id}`] = { userId, bookId, status, progress, pagesRead, addedAt: ts(5) };
  };

  book('b1', 'O Pequeno Explorador', 'Autora Fictícia', 'ana', 'Aventura Épica', 'Iniciante', 120, 'available', null);
  book('b2', 'Mistério na Biblioteca', 'Autor Fictício', 'ana', 'Mistério', 'Aventureiro', 180, 'reading_owner', 'ana');
  book('b3', 'A Floresta dos Números', 'Autora Fictícia', 'bruno', 'Animais Fantásticos', 'Iniciante', 150, 'available', null);
  book('b4', 'O Dragão Gentil', 'Autor Fictício', 'bruno', 'Contos de Fadas', 'Iniciante', 90, 'reading_owner', 'bruno');
  book('b5', 'Viagem ao Centro da Lua', 'Autora Fictícia', 'clara', 'Espaço', 'Aventureiro', 200, 'available', null);
  book('b6', 'O Segredo do Farol', 'Autor Fictício', 'clara', 'Mistério', 'Mestre', 160, 'reading_owner', 'clara');

  shelf('ub1', 'ana', 'b1', 'Lido', 100, 120);
  shelf('ub2', 'ana', 'b2', 'Lendo', 40, 72);
  shelf('ub3', 'bruno', 'b3', 'Lido', 100, 150);
  shelf('ub4', 'bruno', 'b4', 'Lendo', 40, 36);
  shelf('ub5', 'clara', 'b5', 'Lido', 100, 200);
  shelf('ub6', 'clara', 'b6', 'Lendo', 40, 64);

  out['clubs/turma-demo'] = {
    name: 'Turma Demo', description: 'Turma fictícia para a demonstração', code: 'MEMBER-DEMO1',
    ownerId: 'ana', ownerName: 'Ana', members: ['ana', 'bruno', 'clara'],
    memberDetails: BASE_USERS.map(u => ({ uid: u.uid, displayName: u.displayName, avatarUrl: u.avatar })),
    createdAt: ts(3)
  };
  out['club_codes/MEMBER-DEMO1'] = { clubId: 'turma-demo', ownerId: 'ana' };
  return out;
}
