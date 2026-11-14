import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { School, Users, CalendarDays, Trophy, Star, Lock, Info, Plus, Minus, BookOpenCheck, Sparkles } from 'lucide-react';
import { collection, query, where, getDocs, getDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { flagReasonLabel } from '../lib/family';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useIsTeacher } from '../lib/useRole';
import { calculateStatsFromBooks, loadActivity, dayKey, WEEK_MIN_DAYS, READING_DAY_MIN_PAGES } from '../lib/gamification';
import { FEELINGS } from '../lib/readingLog';
import { safeAvatar } from '../lib/avatars';
import { cn } from '../lib/utils';

// Turma exibida no painel. Na versão real, virá da turma vinculada à professora.
const CLASS_ID = 'turma-5a';

interface StudentRow {
  uid: string;
  name: string;
  avatar: string;
  currentTitle: string | null;
  currentPct: number;
  days7: number;
  pages7: number;
  done30: number;
  lastRead: string | null;
  totalDone: number;
}
interface RecordRow { id: string; name: string; avatar: string; title: string; rating: number; feeling: string; note: string; day: string }
interface PanelData {
  cls: { name: string; school: string; goalBooks: number };
  students: StudentRow[];
  records: RecordRow[];
}

const shiftDay = (n: number) => dayKey(new Date(Date.now() - n * 86400000));

function ago(day: string | null, today: string) {
  if (!day) return 'ainda não leu';
  const d = Math.round((Date.parse(today) - Date.parse(day)) / 86400000);
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
}

function statusOf(s: StudentRow, today: string): { label: string; cls: string } {
  if (s.days7 >= WEEK_MIN_DAYS) return { label: 'Em ritmo', cls: 'bg-emerald-100 text-emerald-800' };
  if (s.days7 >= 1) return { label: 'Lendo nesta semana', cls: 'bg-sky-100 text-sky-800' };
  const gap = s.lastRead ? Math.round((Date.parse(today) - Date.parse(s.lastRead)) / 86400000) : 99;
  return gap >= 7
    ? { label: 'Sem leitura há 7+ dias · vale um convite', cls: 'bg-amber-100 text-amber-900' }
    : { label: 'Ainda não leu nesta semana', cls: 'bg-surface-variant text-on-surface-variant' };
}

export default function TeacherPanel() {
  const { user } = useAuth();
  const { isTeacher, loading: roleLoading } = useIsTeacher();
  const [data, setData] = useState<PanelData | null>(null);
  const [error, setError] = useState('');
  const today = dayKey();

  useEffect(() => {
    if (!isTeacher) return;
    let off = false;
    (async () => {
      try {
        const clsSnap = await getDoc(doc(db, 'classes', CLASS_ID));
        if (!clsSnap.exists()) { setError('Turma não encontrada.'); return; }
        const cls = clsSnap.data() as any;
        const cut7 = shiftDay(6);
        const cut30 = shiftDay(29);

        const students: StudentRow[] = [];
        const records: RecordRow[] = [];

        await Promise.all((cls.studentIds as string[]).map(async uid => {
          const [uSnap, ubSnap, recSnap, activity] = await Promise.all([
            getDoc(doc(db, 'users', uid)),
            getDocs(query(collection(db, 'user_books'), where('userId', '==', uid))),
            getDocs(query(collection(db, 'reading_records'), where('userId', '==', uid))),
            loadActivity(uid)
          ]);
          const u = (uSnap.exists() ? uSnap.data() : {}) as any;

          const joined = await Promise.all(ubSnap.docs.map(async d => {
            const ub = d.data() as any;
            const b = await getDoc(doc(db, 'books', ub.bookId));
            return b.exists() ? { ...ub, bookDetails: b.data() as any } : null;
          }));
          const books = joined.filter(Boolean) as any[];
          const titleById = new Map<string, string>(books.map(b => [b.bookId, b.bookDetails.title]));

          const stats = calculateStatsFromBooks(books, activity, today);

          // Janela móvel de 7 dias (robusta ao dia da semana em que a professora abre o painel)
          const pagesByDay = new Map<string, number>();
          activity.logs.forEach(l => pagesByDay.set(l.day, (pagesByDay.get(l.day) || 0) + l.pages));
          let days7 = 0, pages7 = 0;
          pagesByDay.forEach((p, d) => { if (d >= cut7 && d <= today) { pages7 += p; if (p >= READING_DAY_MIN_PAGES) days7++; } });
          const lastRead = activity.logs.reduce<string | null>((m, l) => (!m || l.day > m ? l.day : m), null);

          const lidoIds = new Set(books.filter(b => b.status === 'Lido').map(b => b.bookId));
          const done30 = activity.records.filter(r => lidoIds.has(r.bookId) && r.day >= cut30).length;

          const reading = books.find(b => b.status === 'Lendo');
          students.push({
            uid,
            name: u.displayName || uid,
            avatar: safeAvatar(u.avatarUrl, uid),
            currentTitle: reading ? reading.bookDetails.title : null,
            currentPct: reading ? Math.round(reading.progress || 0) : 0,
            days7, pages7, done30, lastRead,
            totalDone: stats.completedBooks
          });

          recSnap.docs.forEach(d => {
            const r = d.data() as any;
            records.push({
              id: d.id, name: u.displayName || uid, avatar: safeAvatar(u.avatarUrl, uid),
              title: titleById.get(r.bookId) || 'Livro', rating: r.rating, feeling: r.feeling,
              note: r.note || '', day: r.day
            });
          });
        }));

        students.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')); // ordem alfabética: sem ranking
        records.sort((a, b) => b.day.localeCompare(a.day));
        if (!off) setData({ cls: { name: cls.name, school: cls.school, goalBooks: cls.goalBooks || 10 }, students, records: records.slice(0, 8) });
      } catch (err) {
        console.error(err);
        if (!off) setError('Não foi possível carregar o painel.');
      }
    })();
    return () => { off = true; };
  }, [isTeacher, today]);

  // Livros sinalizados pelas famílias, para a professora decidir (não mostra quem sinalizou).
  const [flags, setFlags] = useState<Array<{ id: string; bookId: string; bookTitle: string; reason: string }>>([]);
  const [flagTick, setFlagTick] = useState(0);
  useEffect(() => {
    if (!isTeacher) return;
    getDocs(query(collection(db, 'book_flags'), where('status', '==', 'open')))
      .then(s => setFlags(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))))
      .catch(() => setFlags([]));
  }, [isTeacher, flagTick]);
  const reviewFlag = async (f: { id: string; bookId: string }, decision: 'kept' | 'removed') => {
    try {
      if (decision === 'removed') await updateDoc(doc(db, 'books', f.bookId), { status: 'archived' });
      await updateDoc(doc(db, 'book_flags', f.id), { status: decision, reviewedAt: serverTimestamp() });
      setFlagTick(n => n + 1);
    } catch (e) { console.error(e); alert('Não foi possível concluir a revisão.'); }
  };

  const changeGoal = async (delta: number) => {
    if (!data) return;
    const next = Math.min(99, Math.max(1, data.cls.goalBooks + delta));
    setData({ ...data, cls: { ...data.cls, goalBooks: next } });
    try { await updateDoc(doc(db, 'classes', CLASS_ID), { goalBooks: next }); } catch (e) { console.warn(e); }
  };

  if (roleLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center font-headline-md text-primary">Carregando o painel...</div>;
  }
  if (!user || !isTeacher) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Lock className="w-10 h-10 text-primary" />
        <h1 className="font-headline-md text-primary">Área do professor</h1>
        <p className="text-on-surface-variant max-w-sm">Este painel é exclusivo para professores. Use o seletor de usuário (canto da tela) para entrar como a professora.</p>
        <Link to="/dashboard" className="underline text-primary font-bold">Ir para a minha estante</Link>
      </div>
    );
  }
  if (error) return <div className="min-h-screen flex items-center justify-center text-on-surface">{error}</div>;
  if (!data) return <div className="min-h-screen bg-background flex items-center justify-center font-headline-md text-primary">Carregando a turma...</div>;

  const { cls, students, records } = data;
  const done30 = students.reduce((n, s) => n + s.done30, 0);
  const pages7 = students.reduce((n, s) => n + s.pages7, 0);
  const active7 = students.filter(s => s.days7 >= 1).length;
  const goalPct = Math.min(100, Math.round((done30 / cls.goalBooks) * 100));
  const goalDone = done30 >= cls.goalBooks;

  return (
    <div className="min-h-screen bg-background text-on-background pb-40">
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md shadow-sm">
        <div className="max-w-[1100px] mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <School className="w-8 h-8 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="font-headline-lg-mobile text-primary leading-tight truncate">Painel do Professor</h1>
              <p className="text-xs text-on-surface-variant truncate">{cls.school} · {cls.name}</p>
            </div>
          </div>
          <span className="shrink-0 text-[11px] font-bold bg-tertiary-container text-on-tertiary-container px-3 py-1 rounded-full">Dados fictícios</span>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-4 pt-6 space-y-6">
        {/* Resumo */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: Users, label: 'Alunos que leram (7 dias)', value: `${active7} de ${students.length}` },
            { icon: BookOpenCheck, label: 'Livros concluídos (30 dias)', value: String(done30) },
            { icon: CalendarDays, label: 'Páginas lidas (7 dias)', value: String(pages7) },
            { icon: Star, label: 'Livros lidos pela turma (total)', value: String(students.reduce((n, s) => n + s.totalDone, 0)) }
          ].map(c => (
            <div key={c.label} className="bg-surface-container rounded-2xl p-4 border border-surface-variant">
              <c.icon className="w-5 h-5 text-primary mb-2" />
              <div className="font-headline-md text-on-surface">{c.value}</div>
              <div className="text-xs text-on-surface-variant">{c.label}</div>
            </div>
          ))}
        </section>

        {/* Meta coletiva */}
        <section className="bg-surface-container-high rounded-[2rem] p-6 border-2 border-secondary-container">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-headline-md text-primary flex items-center gap-2"><Trophy className="w-6 h-6" /> Meta da turma</h2>
              <p className="text-sm text-on-surface-variant mt-1">Livros concluídos pela turma nos últimos 30 dias. A turma toda conquista junto, sem ranking entre alunos.</p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-on-surface-variant">Meta:</span>
              <button onClick={() => changeGoal(-1)} aria-label="Diminuir meta" className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center cursor-pointer hover:bg-surface-variant"><Minus className="w-4 h-4" /></button>
              <span className="font-bold text-on-surface w-8 text-center">{cls.goalBooks}</span>
              <button onClick={() => changeGoal(1)} aria-label="Aumentar meta" className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center cursor-pointer hover:bg-surface-variant"><Plus className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="mt-4 w-full bg-surface-variant rounded-full h-4 overflow-hidden">
            <div className={cn('h-full rounded-full transition-all duration-700', goalDone ? 'bg-tertiary' : 'bg-primary')} style={{ width: `${goalPct}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="font-bold text-on-surface">{done30} de {cls.goalBooks} livros ({goalPct}%)</span>
            <span className={cn('flex items-center gap-1', goalDone ? 'text-tertiary font-bold' : 'text-on-surface-variant')}>
              <Sparkles className="w-4 h-4" /> {goalDone ? 'Relíquia desbloqueada: Biblioteca de Alexandria 🏛️' : 'Ao bater a meta: relíquia "Biblioteca de Alexandria" 🏛️'}
            </span>
          </div>
        </section>

        {/* Alunos */}
        <section>
          <h2 className="font-headline-md text-primary mb-1">Alunos da turma</h2>
          <p className="text-xs text-on-surface-variant mb-3 flex items-center gap-1"><Info className="w-3.5 h-3.5" /> Em ordem alfabética, sem ranking: o objetivo é acompanhar cada criança, não compará-las.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {students.map(s => {
              const st = statusOf(s, today);
              return (
                <article key={s.uid} className="bg-surface-container rounded-2xl p-4 border border-surface-variant">
                  <div className="flex items-center gap-3">
                    <img src={s.avatar} alt="" className="w-11 h-11 rounded-full bg-primary-container object-cover" referrerPolicy="no-referrer" />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-on-surface truncate">{s.name}</h3>
                      <p className="text-xs text-on-surface-variant truncate">
                        {s.currentTitle ? <>Lendo: <em>{s.currentTitle}</em> ({s.currentPct}%)</> : 'Sem livro em andamento'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1" aria-label={`${s.days7} dias de leitura nos últimos 7 dias`}>
                      {Array.from({ length: 7 }).map((_, i) => (
                        <span key={i} className={cn('w-3.5 h-3.5 rounded-full', i < s.days7 ? 'bg-primary' : 'bg-surface-variant')} />
                      ))}
                      <span className="text-xs text-on-surface-variant ml-2">{s.days7} {s.days7 === 1 ? 'dia' : 'dias'} · meta {WEEK_MIN_DAYS}</span>
                    </div>
                    <span className="text-xs text-on-surface-variant whitespace-nowrap">Última leitura: {ago(s.lastRead, today)}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                    <span className={cn('text-[11px] font-bold px-2.5 py-1 rounded-full', st.cls)}>{st.label}</span>
                    <span className="text-xs text-on-surface-variant">{s.done30} livro(s) concluído(s) em 30 dias · {s.pages7} págs. em 7 dias</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Livros sinalizados pelas famílias */}
        {flags.length > 0 && (
          <section>
            <h2 className="font-headline-md text-primary mb-1">Livros sinalizados pelas famílias</h2>
            <p className="text-xs text-on-surface-variant mb-3">Decida se o livro continua na biblioteca da turma. A família não é identificada.</p>
            <ul className="space-y-2">
              {flags.map(f => (
                <li key={f.id} className="rounded-2xl bg-surface-container-lowest border border-outline-variant/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span><b>{f.bookTitle}</b><br /><span className="text-xs text-on-surface-variant">{flagReasonLabel(f.reason)}</span></span>
                  <span className="flex gap-2">
                    <button onClick={() => reviewFlag(f, 'kept')} className="px-3 py-1.5 rounded-xl bg-surface-container-high text-xs font-bold cursor-pointer">Manter</button>
                    <button onClick={() => reviewFlag(f, 'removed')} className="px-3 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-bold cursor-pointer">Retirar da biblioteca</button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Registros */}
        <section>
          <h2 className="font-headline-md text-primary mb-1">Registros de leitura recentes</h2>
          <p className="text-xs text-on-surface-variant mb-3 flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> Visíveis só para você. Os colegas não veem as frases dos alunos.</p>
          <ul className="space-y-3">
            {records.map(r => {
              const f = FEELINGS.find(x => x.id === r.feeling);
              return (
                <li key={r.id} className="bg-surface-container rounded-2xl p-4 border border-surface-variant flex gap-3">
                  <img src={r.avatar} alt="" className="w-10 h-10 rounded-full bg-primary-container object-cover shrink-0" referrerPolicy="no-referrer" />
                  <div className="min-w-0">
                    <p className="text-sm text-on-surface"><strong>{r.name}</strong> terminou <em>{r.title}</em> · {'⭐'.repeat(r.rating)}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{f ? `${f.emoji} ${f.label}` : ''} · {r.day.split('-').reverse().join('/')}</p>
                    {r.note && <p className="text-sm text-on-surface mt-1">“{r.note}”</p>}
                  </div>
                </li>
              );
            })}
            {!records.length && <li className="text-sm text-on-surface-variant">Nenhum registro ainda.</li>}
          </ul>
        </section>

        <p className="text-xs text-on-surface-variant text-center pt-2">
          Demonstração com dados fictícios. Na versão real, o painel e os registros só aparecem para o professor da turma, e cada família autoriza o uso.
        </p>
      </main>
    </div>
  );
}
