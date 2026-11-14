import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { HeartHandshake, Lock, BookOpen, Flag, Ban, CheckCircle2, XCircle, ShieldCheck, PauseCircle, Info, LogOut } from 'lucide-react';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useIsGuardian } from '../lib/useRole';
import { calculateStatsFromBooks, loadActivity, dayKey } from '../lib/gamification';
import {
  FamilySettings, EMPTY_FAMILY, FLAG_REASONS, getFamily, loadChildIds,
  updateFamily, flagBook, parentDecision
} from '../lib/family';
import { cn } from '../lib/utils';

type Tab = 'inicio' | 'atividade' | 'biblioteca' | 'controles';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'inicio', label: 'Início' }, { id: 'atividade', label: 'Atividade' },
  { id: 'biblioteca', label: 'Biblioteca do grupo' }, { id: 'controles', label: 'Controles da família' },
];

interface GBook { id: string; title: string; author: string; category: string; ageRating?: string; ownerId: string; ownerName: string; status: string; addedAt?: any }
interface Ex {
  id: string; initiatorId: string; initiatorName: string; receiverId: string; receiverName: string;
  bookTitle: string; status: string; parentApproval?: string; createdAt?: any; updatedAt?: any;
}
interface Data {
  childName: string;
  family: FamilySettings;
  current: { title: string; pct: number } | null;
  daysThisWeek: number; weekGoal: number; completed: number;
  myShared: GBook[];
  exchanges: Ex[];
  groupBooks: GBook[];
  openFlags: Set<string>;
}

const fmt = (t: any) => {
  const d: Date | null = t?.toDate ? t.toDate() : null;
  return d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
};
const millis = (t: any) => (t?.toMillis ? t.toMillis() : 0);

export default function GuardianPanel() {
  const { user, logout } = useAuth();
  const { isGuardian, loading: roleLoading } = useIsGuardian();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('inicio');
  const [childId, setChildId] = useState<string | null>(null);
  const [flagging, setFlagging] = useState<GBook | null>(null);
  const [catFilter, setCatFilter] = useState('');
  const [ageFilter, setAgeFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!isGuardian || !user) return;
    let off = false;
    (async () => {
      try {
        const kids = await loadChildIds(user.uid);
        if (!kids.length) { setError('Nenhum filho vinculado à sua conta. Peça o vínculo à escola.'); return; }
        const cid = childId && kids.includes(childId) ? childId : kids[0];
        if (!off && cid !== childId) setChildId(cid);

        const family = (await getFamily(cid)) || EMPTY_FAMILY;
        const [ubSnap, activity, ownSnap, asInit, asRecv, flagSnap] = await Promise.all([
          getDocs(query(collection(db, 'user_books'), where('userId', '==', cid))),
          loadActivity(cid),
          getDocs(query(collection(db, 'books'), where('ownerId', '==', cid))),
          getDocs(query(collection(db, 'exchanges'), where('initiatorId', '==', cid))),
          getDocs(query(collection(db, 'exchanges'), where('receiverId', '==', cid))),
          getDocs(query(collection(db, 'book_flags'), where('flaggedBy', '==', user.uid)))
        ]);

        const joined = await Promise.all(ubSnap.docs.map(async d => {
          const ub = d.data() as any;
          const b = await getDoc(doc(db, 'books', ub.bookId));
          return b.exists() ? { ...ub, bookDetails: b.data() as any } : null;
        }));
        const books = joined.filter(Boolean) as any[];
        const stats = calculateStatsFromBooks(books, activity, dayKey());
        const reading = books.find(b => b.status === 'Lendo');

        const toBook = (d: any): GBook => ({ id: d.id, ...(d.data() as any) });
        const myShared = ownSnap.docs.map(toBook).filter(b => b.status === 'available' || b.status === 'borrowed');

        const seen = new Set<string>();
        const exchanges = [...asInit.docs, ...asRecv.docs]
          .filter(d => (seen.has(d.id) ? false : (seen.add(d.id), true)))
          .map(d => ({ id: d.id, ...(d.data() as any) } as Ex))
          .filter(e => e.status !== 'chat')
          .sort((a, b) => (millis(b.updatedAt) || millis(b.createdAt)) - (millis(a.updatedAt) || millis(a.createdAt)));

        // Biblioteca do grupo: livros públicos dos membros dos grupos do filho
        const memberIds = new Set<string>();
        for (const cl of family.clubIds || []) {
          const c = await getDoc(doc(db, 'clubs', cl));
          if (c.exists()) ((c.data() as any).members || []).forEach((m: string) => memberIds.add(m));
        }
        let groupBooks: GBook[] = [];
        const ids = [...memberIds].slice(0, 30);
        if (ids.length) {
          const gs = await getDocs(query(collection(db, 'books'), where('ownerId', 'in', ids)));
          groupBooks = gs.docs.map(toBook).filter(b => b.status === 'available' || b.status === 'borrowed')
            .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
        }

        if (!off) setData({
          childName: family.childName || 'Seu filho',
          family,
          current: reading ? { title: reading.bookDetails.title, pct: Math.round(reading.progress || 0) } : null,
          daysThisWeek: stats.daysThisWeek, weekGoal: 4, completed: stats.completedBooks,
          myShared, exchanges, groupBooks,
          openFlags: new Set(flagSnap.docs.map(d => (d.data() as any)).filter(f => f.status === 'open').map(f => f.bookId))
        });
      } catch (err) {
        console.error(err);
        if (!off) setError('Não foi possível carregar a área do responsável.');
      }
    })();
    return () => { off = true; };
  }, [isGuardian, user?.uid, childId, reload]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); setReload(n => n + 1); } catch (e) { console.error(e); alert('Não foi possível concluir a ação.'); } finally { setBusy(false); }
  };

  const waiting = useMemo(() => (data?.exchanges || []).filter(e => e.status === 'pending' && e.parentApproval === 'waiting' && e.initiatorId === childId), [data, childId]);
  const categories = useMemo(() => [...new Set((data?.groupBooks || []).map(b => b.category))].sort(), [data]);
  const ages = ['Livre', '8+', '10+', '12+', '14+'];

  if (roleLoading) return <div className="min-h-screen bg-background flex items-center justify-center font-headline-md text-primary">Carregando...</div>;
  if (!user || !isGuardian) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Lock className="w-10 h-10 text-primary" />
        <h1 className="font-headline-md text-primary">Área do responsável</h1>
        <p className="text-on-surface-variant max-w-sm">Esta área é exclusiva para responsáveis vinculados a um aluno. Na demonstração, use o seletor de usuário (canto da tela).</p>
        <Link to="/dashboard" className="underline text-primary font-bold">Ir para a minha estante</Link>
      </div>
    );
  }
  if (error) return <div className="min-h-screen flex items-center justify-center text-on-surface p-6 text-center">{error}</div>;
  if (!data) return <div className="min-h-screen bg-background flex items-center justify-center font-headline-md text-primary">Carregando...</div>;

  const { family, childName } = data;
  const blockedBooks = data.groupBooks.filter(b => family.blockedBookIds.includes(b.id));
  const statusOf = (e: Ex) => {
    const mine = e.initiatorId === childId;
    if (e.status === 'pending') return e.parentApproval === 'waiting' ? 'Aguardando você' : mine ? 'Aguardando o dono' : 'Aguardando resposta de ' + childName;
    if (e.status === 'accepted') return 'Emprestado';
    if (e.status === 'completed') return 'Devolvido';
    if (e.status === 'cancelled') return 'Cancelado';
    return e.parentApproval === 'denied' ? 'Recusado por você' : 'Recusado';
  };
  const line = (e: Ex) => e.initiatorId === childId
    ? `${childName} pediu "${e.bookTitle}" a @${e.receiverName}`
    : `@${e.initiatorName} pediu "${e.bookTitle}" a ${childName}`;

  return (
    <div className="min-h-screen bg-background text-on-background pb-40">
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md shadow-sm">
        <div className="max-w-[1100px] mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <HeartHandshake className="w-8 h-8 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="font-headline-lg-mobile text-primary leading-tight truncate">Área do Responsável</h1>
              <p className="text-xs text-on-surface-variant truncate">Acompanhando: {childName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {__DEMO__ && <span className="text-[11px] font-bold bg-tertiary-container text-on-tertiary-container px-3 py-1 rounded-full">Dados fictícios</span>}
            {!__DEMO__ && <button onClick={() => logout()} className="p-2 rounded-full hover:bg-surface-container cursor-pointer" title="Sair"><LogOut className="w-5 h-5 text-on-surface-variant" /></button>}
          </div>
        </div>
        <nav className="max-w-[1100px] mx-auto px-4 pb-3 flex gap-2 overflow-x-auto" aria-label="Seções">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} aria-pressed={tab === t.id}
              className={cn('px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap cursor-pointer transition-colors',
                tab === t.id ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest')}>
              {t.label}{t.id === 'inicio' && waiting.length > 0 ? ` (${waiting.length})` : ''}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-[1100px] mx-auto px-4 pt-6 space-y-6">
        {tab === 'inicio' && (
          <>
            <section className="rounded-3xl bg-surface-container-lowest border border-outline-variant/40 p-5 shadow-sm">
              <h2 className="font-headline-md text-primary mb-3">{childName}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div><p className="text-xs text-on-surface-variant">Lendo agora</p><p className="font-bold">{data.current ? `${data.current.title} (${data.current.pct}%)` : 'Nenhum livro em andamento'}</p></div>
                <div><p className="text-xs text-on-surface-variant">Dias de leitura nesta semana</p><p className="font-bold">{data.daysThisWeek} de {data.weekGoal}</p></div>
                <div><p className="text-xs text-on-surface-variant">Livros concluídos</p><p className="font-bold">{data.completed}</p></div>
              </div>
            </section>

            <section>
              <h2 className="font-headline-md text-primary mb-2">Avisos</h2>
              {waiting.length === 0 && <p className="text-sm text-on-surface-variant">Nenhum pedido esperando a sua autorização.</p>}
              <div className="space-y-3">
                {waiting.map(e => (
                  <div key={e.id} className="rounded-2xl bg-secondary-container/60 border border-outline-variant/40 p-4 flex flex-wrap items-center gap-3 justify-between">
                    <p className="text-sm font-bold text-on-secondary-container">{childName} quer pegar "{e.bookTitle}" emprestado de @{e.receiverName}.</p>
                    <div className="flex gap-2">
                      <button disabled={busy} onClick={() => act(() => parentDecision(e.id, 'approved'))} className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />Autorizar</button>
                      <button disabled={busy} onClick={() => act(() => parentDecision(e.id, 'denied'))} className="px-4 py-2 rounded-xl bg-surface-container-high text-on-surface-variant text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1"><XCircle className="w-4 h-4" />Recusar</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="font-headline-md text-primary mb-2">Livros que {childName} colocou na biblioteca</h2>
              {data.myShared.length === 0 && <p className="text-sm text-on-surface-variant">Nenhum livro compartilhado.</p>}
              <ul className="space-y-2">
                {data.myShared.map(b => (
                  <li key={b.id} className="rounded-2xl bg-surface-container-lowest border border-outline-variant/40 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span><b>{b.title}</b> · {b.author} · {b.category}{b.ageRating ? ` · ${b.ageRating}` : ''}</span>
                    <span className="text-xs text-on-surface-variant">{b.status === 'borrowed' ? 'Emprestado agora' : 'Disponível'} · cadastrado em {fmt(b.addedAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {tab === 'atividade' && (
          <section>
            <h2 className="font-headline-md text-primary mb-1">Empréstimos</h2>
            <p className="text-xs text-on-surface-variant mb-3 flex items-center gap-1"><Info className="w-3.5 h-3.5" />Os colegas aparecem só pelo apelido. O chat usa apenas frases prontas, então não há mensagens para ler.</p>
            {data.exchanges.length === 0 && <p className="text-sm text-on-surface-variant">Nenhuma movimentação ainda.</p>}
            <ol className="space-y-2">
              {data.exchanges.map(e => (
                <li key={e.id} className="rounded-2xl bg-surface-container-lowest border border-outline-variant/40 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{line(e)}</span>
                  <span className="flex items-center gap-2 text-xs">
                    <span className="text-on-surface-variant">{fmt(e.updatedAt || e.createdAt)}</span>
                    <span className="px-2 py-0.5 rounded-full bg-surface-container-high font-bold">{statusOf(e)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {tab === 'biblioteca' && (
          <section>
            <h2 className="font-headline-md text-primary mb-1">Biblioteca do grupo</h2>
            <p className="text-xs text-on-surface-variant mb-3">Livros que os colegas colocaram à disposição. Sinalize para a escola revisar ou bloqueie para o seu filho.</p>
            <div className="flex flex-wrap gap-2 mb-4">
              <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="bg-surface-container-highest border border-outline-variant rounded-xl px-3 py-2 text-sm" aria-label="Categoria">
                <option value="">Todas as categorias</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={ageFilter} onChange={e => setAgeFilter(e.target.value)} className="bg-surface-container-highest border border-outline-variant rounded-xl px-3 py-2 text-sm" aria-label="Faixa etária">
                <option value="">Todas as idades</option>
                {ages.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <ul className="space-y-2">
              {data.groupBooks.filter(b => (!catFilter || b.category === catFilter) && (!ageFilter || (b.ageRating || '') === ageFilter)).map(b => {
                const blocked = family.blockedBookIds.includes(b.id) || family.blockedCategories.includes(b.category);
                const flagged = data.openFlags.has(b.id);
                return (
                  <li key={b.id} className={cn('rounded-2xl border border-outline-variant/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm', blocked ? 'bg-surface-container opacity-70' : 'bg-surface-container-lowest')}>
                    <span className="min-w-0">
                      <b>{b.title}</b> · {b.author}<br />
                      <span className="text-xs text-on-surface-variant">{b.category} · faixa {b.ageRating || 'não informada'} · de @{b.ownerName}</span>
                    </span>
                    <span className="flex flex-wrap gap-2 items-center">
                      {flagged && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">Sinalizado</span>}
                      {blocked && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-surface-container-highest">Bloqueado para {childName}</span>}
                      {!flagged && <button disabled={busy} onClick={() => setFlagging(b)} className="px-3 py-1.5 rounded-xl bg-surface-container-high text-xs font-bold cursor-pointer flex items-center gap-1"><Flag className="w-3.5 h-3.5" />Sinalizar</button>}
                      {family.blockedBookIds.includes(b.id)
                        ? <button disabled={busy} onClick={() => act(() => updateFamily(childId!, { blockedBookIds: family.blockedBookIds.filter(x => x !== b.id) }))} className="px-3 py-1.5 rounded-xl bg-surface-container-high text-xs font-bold cursor-pointer">Desbloquear</button>
                        : <button disabled={busy} onClick={() => act(() => updateFamily(childId!, { blockedBookIds: [...family.blockedBookIds, b.id] }))} className="px-3 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-bold cursor-pointer flex items-center gap-1"><Ban className="w-3.5 h-3.5" />Bloquear</button>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {tab === 'controles' && (
          <section className="space-y-4">
            <h2 className="font-headline-md text-primary">Controles da família</h2>
            <label className="rounded-2xl bg-surface-container-lowest border border-outline-variant/40 p-4 flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-1 w-5 h-5" checked={family.requireApproval} disabled={busy}
                onChange={e => act(() => updateFamily(childId!, { requireApproval: e.target.checked }))} />
              <span><b className="flex items-center gap-1"><ShieldCheck className="w-4 h-4" />Exigir a minha autorização nos pedidos de empréstimo</b>
                <span className="text-xs text-on-surface-variant block">O dono do livro só consegue responder depois que você autorizar.</span></span>
            </label>
            <label className="rounded-2xl bg-surface-container-lowest border border-outline-variant/40 p-4 flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-1 w-5 h-5" checked={family.pauseSharing} disabled={busy}
                onChange={e => act(() => updateFamily(childId!, { pauseSharing: e.target.checked }))} />
              <span><b className="flex items-center gap-1"><PauseCircle className="w-4 h-4" />Pausar o compartilhamento de {childName}</b>
                <span className="text-xs text-on-surface-variant block">Ele(a) continua lendo, mas os livros dele(a) deixam de aparecer na biblioteca do grupo (vale a partir da próxima vez que ele(a) abrir o app).</span></span>
            </label>

            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/40 p-4">
              <b>Categorias bloqueadas</b>
              <div className="flex flex-wrap gap-2 mt-2">
                {family.blockedCategories.length === 0 && <span className="text-sm text-on-surface-variant">Nenhuma.</span>}
                {family.blockedCategories.map(c => (
                  <button key={c} disabled={busy} onClick={() => act(() => updateFamily(childId!, { blockedCategories: family.blockedCategories.filter(x => x !== c) }))}
                    className="px-3 py-1 rounded-full bg-surface-container-high text-xs font-bold cursor-pointer">{c} ✕</button>
                ))}
              </div>
              <select value="" disabled={busy} onChange={e => e.target.value && act(() => updateFamily(childId!, { blockedCategories: [...family.blockedCategories, e.target.value] }))}
                className="mt-3 bg-surface-container-highest border border-outline-variant rounded-xl px-3 py-2 text-sm" aria-label="Bloquear categoria">
                <option value="">Bloquear uma categoria…</option>
                {categories.filter(c => !family.blockedCategories.includes(c)).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/40 p-4">
              <b>Livros bloqueados</b>
              <div className="flex flex-wrap gap-2 mt-2">
                {family.blockedBookIds.length === 0 && <span className="text-sm text-on-surface-variant">Nenhum.</span>}
                {family.blockedBookIds.map(id => (
                  <button key={id} disabled={busy} onClick={() => act(() => updateFamily(childId!, { blockedBookIds: family.blockedBookIds.filter(x => x !== id) }))}
                    className="px-3 py-1 rounded-full bg-surface-container-high text-xs font-bold cursor-pointer">{blockedBooks.find(b => b.id === id)?.title || 'Livro bloqueado'} ✕</button>
                ))}
              </div>
            </div>
            <p className="text-xs text-on-surface-variant">Seu filho vê apenas o resultado (livros que somem ou pedidos que dependem de autorização). Ele não altera estes controles.</p>
          </section>
        )}
      </main>

      {flagging && (
        <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" onClick={() => setFlagging(null)}>
          <div className="bg-surface-container-lowest rounded-3xl p-5 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-headline-md text-primary mb-1">Sinalizar livro</h3>
            <p className="text-xs text-on-surface-variant mb-3">"{flagging.title}": a professora recebe o aviso e decide se retira o livro.</p>
            <div className="space-y-2">
              {FLAG_REASONS.map(r => (
                <button key={r.id} disabled={busy} className="w-full text-left px-4 py-2.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-sm font-bold cursor-pointer"
                  onClick={() => act(async () => { await flagBook(user.uid, childId!, flagging, r.id); setFlagging(null); })}>{r.label}</button>
              ))}
            </div>
            <button onClick={() => setFlagging(null)} className="mt-3 text-xs underline text-on-surface-variant cursor-pointer">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
