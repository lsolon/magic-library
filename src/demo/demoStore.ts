/**
 * Ambiente de demonstração LOCAL (rota /demo): 3 alunos fictícios, sem login,
 * sem Firebase e sem imagens externas. Tudo fica em memória/localStorage do navegador.
 * A máquina de estados espelha o fluxo real de empréstimo (src/lib/loans.ts).
 */
import { CHAT_PRESET_BY_ID } from '../lib/chatPresets';

export type StudentId = 'ana' | 'bruno' | 'clara';
export type BookStatus = 'available' | 'borrowed' | 'reading_owner';
export type ExchangeStatus = 'chat' | 'pending' | 'accepted' | 'declined' | 'cancelled' | 'completed';

export interface Student { id: StudentId; nick: string; emoji: string }
export interface Book {
  id: string; title: string; author: string; ownerId: StudentId; emoji: string;
  totalPages: number; pagesRead: number; status: BookStatus; currentReaderId: StudentId | null;
}
export interface Message { id: string; senderId: StudentId | 'system'; presetId?: string; systemKind?: string; at: number }
export interface Exchange {
  id: string; initiatorId: StudentId; receiverId: StudentId; bookId: string;
  status: ExchangeStatus; messages: Message[]; createdAt: number;
}
export interface LogEntry { at: number; text: string }
export interface DemoState { books: Book[]; exchanges: Exchange[]; log: LogEntry[]; seq: number }

export const STUDENTS: Student[] = [
  { id: 'ana', nick: 'Ana', emoji: '🦊' },
  { id: 'bruno', nick: 'Bruno', emoji: '🐼' },
  { id: 'clara', nick: 'Clara', emoji: '🦉' },
];
export const studentById = (id: string) => STUDENTS.find(s => s.id === id)!;

export function seedState(): DemoState {
  const mk = (id: string, title: string, author: string, ownerId: StudentId, emoji: string, totalPages: number): Book => ({
    id, title, author, ownerId, emoji, totalPages, pagesRead: totalPages, status: 'available', currentReaderId: null
  });
  return {
    books: [
      mk('b1', 'O Pequeno Explorador', 'Autora Fictícia', 'ana', '🧭', 120),
      mk('b2', 'Mistério na Biblioteca', 'Autor Fictício', 'ana', '🔍', 180),
      mk('b3', 'A Floresta dos Números', 'Autora Fictícia', 'bruno', '🌳', 150),
      mk('b4', 'Viagem ao Centro da Lua', 'Autor Fictício', 'clara', '🌙', 200),
    ],
    exchanges: [], log: [], seq: 1
  };
}

const KEY = 'magic-library-demo-v1';
export function loadState(): DemoState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DemoState;
  } catch { /* ignora */ }
  return seedState();
}
export function saveState(s: DemoState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignora */ }
}
export function resetState(): DemoState {
  const s = seedState();
  saveState(s);
  return s;
}

export type Result = { ok: true; state: DemoState } | { ok: false; error: string; state: DemoState };

// ---- helpers (imutáveis) ----
const clone = (s: DemoState): DemoState => JSON.parse(JSON.stringify(s));
const log = (s: DemoState, text: string) => { s.log.unshift({ at: Date.now(), text }); s.log = s.log.slice(0, 40); };
const nid = (s: DemoState, p: string) => `${p}${s.seq++}`;
const msg = (s: DemoState, ex: Exchange, senderId: Message['senderId'], f: Partial<Message>) =>
  ex.messages.push({ id: nid(s, 'm'), senderId, at: Date.now(), ...f });
const fail = (state: DemoState, error: string): Result => ({ ok: false, error, state });
const done = (state: DemoState): Result => { saveState(state); return { ok: true, state }; };

// ---- ações ----
export function requestLoan(prev: DemoState, who: StudentId, bookId: string): Result {
  const s = clone(prev);
  const book = s.books.find(b => b.id === bookId);
  if (!book) return fail(prev, 'Livro não encontrado.');
  if (book.ownerId === who) return fail(prev, 'Você é o(a) dono(a) deste livro.');
  if (book.status !== 'available') return fail(prev, 'Este livro não está disponível.');
  const open = s.exchanges.find(e => e.bookId === bookId && e.initiatorId === who && e.status === 'pending');
  if (open) return done(s); // não duplica pedido
  const ex: Exchange = { id: nid(s, 'e'), initiatorId: who, receiverId: book.ownerId, bookId, status: 'pending', messages: [], createdAt: Date.now() };
  msg(s, ex, 'system', { systemKind: 'loan_request' });
  s.exchanges.push(ex);
  log(s, `${studentById(who).nick} pediu "${book.title}" (livro continua disponível).`);
  return done(s);
}

function getEx(s: DemoState, id: string) { return s.exchanges.find(e => e.id === id); }

export function acceptLoan(prev: DemoState, who: StudentId, exId: string): Result {
  const s = clone(prev);
  const ex = getEx(s, exId);
  if (!ex) return fail(prev, 'Troca não encontrada.');
  if (ex.receiverId !== who) return fail(prev, 'Só o dono do livro pode aceitar.');
  if (ex.status !== 'pending') return fail(prev, 'Este pedido já foi respondido.');
  const book = s.books.find(b => b.id === ex.bookId)!;
  if (book.status !== 'available') return fail(prev, 'O livro não está mais disponível.');
  ex.status = 'accepted';
  msg(s, ex, 'system', { systemKind: 'loan_accepted' });
  book.status = 'borrowed'; book.currentReaderId = ex.initiatorId; book.pagesRead = 0;
  s.exchanges.filter(o => o.id !== ex.id && o.bookId === ex.bookId && o.status === 'pending').forEach(o => {
    o.status = 'declined'; msg(s, o, 'system', { systemKind: 'loan_declined' });
    log(s, `Pedido de ${studentById(o.initiatorId).nick} recusado automaticamente (livro já emprestado).`);
  });
  log(s, `${studentById(who).nick} aceitou: "${book.title}" agora está com ${studentById(ex.initiatorId).nick}.`);
  return done(s);
}

export function declineLoan(prev: DemoState, who: StudentId, exId: string): Result {
  const s = clone(prev); const ex = getEx(s, exId);
  if (!ex) return fail(prev, 'Troca não encontrada.');
  if (ex.receiverId !== who) return fail(prev, 'Só o dono do livro pode recusar.');
  if (ex.status !== 'pending') return fail(prev, 'Este pedido já foi respondido.');
  ex.status = 'declined'; msg(s, ex, 'system', { systemKind: 'loan_declined' });
  log(s, `${studentById(who).nick} recusou o pedido.`);
  return done(s);
}

export function cancelLoan(prev: DemoState, who: StudentId, exId: string): Result {
  const s = clone(prev); const ex = getEx(s, exId);
  if (!ex) return fail(prev, 'Troca não encontrada.');
  if (ex.initiatorId !== who) return fail(prev, 'Só quem pediu pode cancelar.');
  if (ex.status !== 'pending') return fail(prev, 'Só dá para cancelar pedido pendente.');
  ex.status = 'cancelled'; msg(s, ex, 'system', { systemKind: 'loan_cancelled' });
  log(s, `${studentById(who).nick} cancelou o pedido.`);
  return done(s);
}

export function completeLoan(prev: DemoState, who: StudentId, exId: string): Result {
  const s = clone(prev); const ex = getEx(s, exId);
  if (!ex) return fail(prev, 'Troca não encontrada.');
  if (ex.receiverId !== who) return fail(prev, 'Só o dono confirma a devolução.');
  if (ex.status !== 'accepted') return fail(prev, 'Só empréstimo aprovado pode ser devolvido.');
  const book = s.books.find(b => b.id === ex.bookId)!;
  ex.status = 'completed'; msg(s, ex, 'system', { systemKind: 'loan_completed' });
  book.status = 'reading_owner'; book.currentReaderId = book.ownerId;
  log(s, `${studentById(who).nick} confirmou a devolução de "${book.title}".`);
  return done(s);
}

export function sendPreset(prev: DemoState, who: StudentId, exId: string, presetId: string): Result {
  const s = clone(prev); const ex = getEx(s, exId);
  if (!ex) return fail(prev, 'Troca não encontrada.');
  if (ex.initiatorId !== who && ex.receiverId !== who) return fail(prev, 'Você não participa desta conversa.');
  if (!CHAT_PRESET_BY_ID[presetId]) return fail(prev, 'Mensagem inválida.');
  if (['declined', 'cancelled', 'completed'].includes(ex.status)) return fail(prev, 'Conversa encerrada.');
  msg(s, ex, who, { presetId });
  return done(s);
}

export function saveProgress(prev: DemoState, who: StudentId, bookId: string, pages: number): Result {
  const s = clone(prev); const book = s.books.find(b => b.id === bookId);
  if (!book) return fail(prev, 'Livro não encontrado.');
  if (book.status !== 'borrowed' || book.currentReaderId !== who) return fail(prev, 'Você não está com este livro.');
  book.pagesRead = Math.max(0, Math.min(book.totalPages, Math.round(pages) || 0));
  log(s, `${studentById(who).nick} leu até a página ${book.pagesRead} de "${book.title}".`);
  return done(s);
}

/** Livros que o aluno tem na estante: os próprios + os emprestados com aprovação. */
export function shelfOf(s: DemoState, who: StudentId): Book[] {
  return s.books.filter(b => b.ownerId === who || (b.status === 'borrowed' && b.currentReaderId === who));
}
