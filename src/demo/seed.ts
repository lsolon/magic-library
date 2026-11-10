/** Dados fictícios do ambiente de demonstração (3 alunos, 1 turma, 6 livros). Sem dados reais. */
import { defaultAvatarFor } from '../lib/avatars';
import type { BandId } from '../lib/bands';

export const DEMO_USERS: Array<{ uid: string; displayName: string; email: string; avatar: string; band: BandId; grade: string }> = [
  { uid: 'ana', displayName: 'Ana', email: 'ana@demo.invalid', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=fenix', band: 'fund1', grade: '3º ano' },
  { uid: 'bruno', displayName: 'Bruno', email: 'bruno@demo.invalid', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=dragao', band: 'fund2', grade: '7º ano' },
  { uid: 'clara', displayName: 'Clara', email: 'clara@demo.invalid', avatar: 'https://api.dicebear.com/7.x/fun-emoji/svg?seed=coruja', band: 'medio', grade: '1ª série EM' },
];

type Ts = { fromMillis(ms: number): any };

export function buildSeed(Timestamp: Ts): Record<string, Record<string, any>> {
  const now = Date.now();
  const ts = (daysAgo = 0) => Timestamp.fromMillis(now - daysAgo * 86400000);
  const out: Record<string, Record<string, any>> = {};

  DEMO_USERS.forEach(u => {
    out[`users/${u.uid}`] = {
      displayName: u.displayName, realName: u.displayName, avatarUrl: u.avatar || defaultAvatarFor(u.uid),
      magicalTitle: 'Explorador(a) de Mundos', favoriteGenres: 'Aventura, Mistério', bio: '',
      band: u.band, level: 1, xp: 0, stars: 0, isSubscribed: true, createdAt: ts(2)
    };
    out[`usernames/u_${encodeURIComponent(u.displayName.toLowerCase())}`] = { uid: u.uid, displayName: u.displayName };
  });

  const book = (id: string, title: string, author: string, ownerId: string, category: string, difficulty: string,
    totalPages: number, status: string, readerId: string | null) => {
    const owner = DEMO_USERS.find(u => u.uid === ownerId)!;
    out[`books/${id}`] = {
      title, author, category, difficulty, synopsis: 'Livro fictício para a demonstração.', totalPages, coverUrl: '',
      ownerId, ownerName: owner.displayName, currentReaderId: readerId,
      currentReaderName: readerId ? DEMO_USERS.find(u => u.uid === readerId)!.displayName : null,
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
    memberDetails: DEMO_USERS.map(u => ({ uid: u.uid, displayName: u.displayName, avatarUrl: u.avatar })),
    createdAt: ts(3)
  };
  out['club_codes/MEMBER-DEMO1'] = { clubId: 'turma-demo', ownerId: 'ana' };
  return out;
}
