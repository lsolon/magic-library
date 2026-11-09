import React, { useState } from 'react';
import { CHAT_PRESETS, CHAT_PRESET_BY_ID, CHAT_PRESET_GROUPS, systemMessageText, ChatPreset } from '../lib/chatPresets';
import {
  STUDENTS, studentById, loadState, resetState, requestLoan, acceptLoan, declineLoan, cancelLoan,
  completeLoan, sendPreset, saveProgress, shelfOf, DemoState, Exchange, Result, StudentId
} from '../demo/demoStore';

type Tab = 'grupo' | 'chat' | 'estante';

const STATUS_LABEL: Record<string, string> = {
  chat: 'Conversa', pending: 'Pendente', accepted: 'Emprestado', declined: 'Recusado', cancelled: 'Cancelado', completed: 'Concluído'
};

/** Ambiente de demonstração: 3 alunos fictícios, sem login e sem Firebase. */
export default function Demo() {
  const [state, setState] = useState<DemoState>(() => loadState());
  const [who, setWho] = useState<StudentId>('ana');
  const [tab, setTab] = useState<Tab>('grupo');
  const [exId, setExId] = useState<string | null>(null);
  const [group, setGroup] = useState<ChatPreset['group']>('combinar');
  const [error, setError] = useState('');
  const [pages, setPages] = useState<Record<string, string>>({});

  const apply = (r: Result) => { setState(r.state); setError(r.ok === false ? r.error : ''); return r.ok; };

  const me = studentById(who);
  const myExchanges = state.exchanges.filter(e => e.initiatorId === who || e.receiverId === who);
  const selected = myExchanges.find(e => e.id === exId) || null;
  const bookOf = (id: string) => state.books.find(b => b.id === id)!;
  const pendingForMe = myExchanges.filter(e => e.status === 'pending' && e.receiverId === who).length;

  const exText = (ex: Exchange, kind: string) => systemMessageText(kind, {
    initiatorName: studentById(ex.initiatorId).nick, receiverName: studentById(ex.receiverId).nick, bookTitle: bookOf(ex.bookId).title
  });

  const openChat = (id: string) => { setExId(id); setTab('chat'); };

  return (
    <div className="min-h-screen bg-background text-on-background pb-16">
      <div className="bg-tertiary-container text-on-tertiary-container text-center text-xs font-bold py-2 px-3">
        🧪 Ambiente de demonstração — alunos e livros fictícios, sem login. Nada é salvo no servidor.
      </div>

      <header className="max-w-[900px] mx-auto px-4 pt-4">
        <h1 className="text-2xl font-bold text-primary mb-3">Magic Library · Demo</h1>
        <p className="text-xs text-on-surface-variant mb-2">Quem você é agora:</p>
        <div className="flex gap-2 flex-wrap">
          {STUDENTS.map(s => (
            <button key={s.id} onClick={() => { setWho(s.id); setExId(null); setError(''); }}
              className={`px-4 py-2 rounded-2xl text-sm font-bold cursor-pointer transition-colors ${who === s.id ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
              {s.emoji} {s.nick}
            </button>
          ))}
          <button onClick={() => { if (window.confirm('Zerar a demonstração?')) { setState(resetState()); setExId(null); setError(''); } }}
            className="ml-auto px-3 py-2 rounded-2xl text-xs font-bold bg-surface-container-high text-on-surface-variant cursor-pointer">↺ Reiniciar</button>
        </div>

        <nav className="flex gap-2 mt-4" role="tablist">
          {([['grupo', '📚 Livros do grupo'], ['chat', `💬 Chat${pendingForMe ? ` (${pendingForMe})` : ''}`], ['estante', '🏠 Minha estante']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-full text-xs font-bold cursor-pointer ${tab === t ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container text-on-surface-variant'}`}>{label}</button>
          ))}
        </nav>
        {error && <p role="alert" className="mt-3 text-xs font-bold text-error bg-error-container/40 rounded-xl px-3 py-2">⚠️ {error}</p>}
      </header>

      <main className="max-w-[900px] mx-auto px-4 mt-4 space-y-4">
        {tab === 'grupo' && (
          <div className="grid sm:grid-cols-2 gap-3">
            {state.books.map(b => {
              const mine = b.ownerId === who;
              const myPending = state.exchanges.find(e => e.bookId === b.id && e.initiatorId === who && e.status === 'pending');
              return (
                <div key={b.id} className="bg-surface-container rounded-2xl p-4 flex gap-3">
                  <div className="w-16 h-20 rounded-xl bg-primary-container flex items-center justify-center text-3xl shrink-0">{b.emoji}</div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm text-primary">{b.title}</h3>
                    <p className="text-[11px] text-on-surface-variant">Dono(a): {studentById(b.ownerId).nick}</p>
                    <p className="text-[11px] mt-1">
                      {b.status === 'available' ? '✅ Disponível' : b.status === 'borrowed' ? `📖 Com ${studentById(b.currentReaderId!).nick}` : '🔒 Com o dono'}
                    </p>
                    <div className="mt-2">
                      {mine ? <span className="text-[11px] text-on-surface-variant">Seu livro</span>
                        : myPending ? <button onClick={() => openChat(myPending.id)} className="px-3 py-1.5 rounded-xl bg-secondary-container text-on-secondary-container text-xs font-bold cursor-pointer">Pedido enviado · ver chat</button>
                        : b.status === 'available' ? <button onClick={() => { const r = requestLoan(state, who, b.id); if (apply(r)) { const ex = r.state.exchanges.find(e => e.bookId === b.id && e.initiatorId === who && e.status === 'pending'); if (ex) openChat(ex.id); } }}
                            className="px-3 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-bold cursor-pointer">Pedir Emprestado</button>
                        : <span className="text-[11px] text-on-surface-variant">Indisponível</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'chat' && (
          <div className="grid md:grid-cols-[240px_1fr] gap-3">
            <div className="bg-surface-container rounded-2xl p-2 space-y-1 h-fit">
              <p className="text-[11px] font-bold text-primary px-2 py-1">Conversas ({myExchanges.length})</p>
              {myExchanges.length === 0 && <p className="text-[11px] text-on-surface-variant px-2 pb-2">Nenhuma troca ainda.</p>}
              {myExchanges.map(e => {
                const other = studentById(e.initiatorId === who ? e.receiverId : e.initiatorId);
                return (
                  <button key={e.id} onClick={() => setExId(e.id)}
                    className={`w-full text-left rounded-xl px-3 py-2 cursor-pointer ${exId === e.id ? 'bg-primary-container' : 'hover:bg-surface-container-high'}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold">{other.emoji} {other.nick}</span>
                      <span className="text-[10px] bg-secondary-container text-on-secondary-container px-1.5 rounded font-bold">
                        {e.status === 'pending' ? (e.receiverId === who ? 'Responder' : 'Aguardando') : STATUS_LABEL[e.status]}
                      </span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant truncate">📖 {bookOf(e.bookId).title}</p>
                  </button>
                );
              })}
            </div>

            {selected ? (
              <div className="bg-surface-container rounded-2xl overflow-hidden flex flex-col">
                <div className="px-4 py-3 flex items-center justify-between gap-2 border-b border-outline-variant/30">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">📖 {bookOf(selected.bookId).title}</p>
                    <p className="text-[11px] text-on-surface-variant">{studentById(selected.initiatorId).nick} → {studentById(selected.receiverId).nick} · {STATUS_LABEL[selected.status]}</p>
                  </div>
                  {selected.status === 'accepted' && selected.receiverId === who && (
                    <button onClick={() => apply(completeLoan(state, who, selected.id))} className="px-3 py-1.5 rounded-xl bg-tertiary-container text-on-tertiary-container text-xs font-bold cursor-pointer">Livro devolvido</button>
                  )}
                </div>

                {selected.status === 'pending' && (
                  <div className="bg-secondary-container/60 px-4 py-3 flex flex-wrap gap-2 items-center justify-between">
                    <p className="text-xs font-bold text-on-secondary-container">
                      {selected.receiverId === who ? `${studentById(selected.initiatorId).nick} quer pegar este livro emprestado.` : 'Pedido enviado. Aguardando o dono responder.'}
                    </p>
                    <div className="flex gap-2">
                      {selected.receiverId === who && <>
                        <button onClick={() => apply(acceptLoan(state, who, selected.id))} className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold cursor-pointer">Aceitar</button>
                        <button onClick={() => apply(declineLoan(state, who, selected.id))} className="px-4 py-2 rounded-xl bg-surface-container-high text-on-surface-variant text-xs font-bold cursor-pointer">Recusar</button>
                      </>}
                      {selected.initiatorId === who &&
                        <button onClick={() => apply(cancelLoan(state, who, selected.id))} className="px-4 py-2 rounded-xl bg-surface-container-high text-on-surface-variant text-xs font-bold cursor-pointer">Cancelar pedido</button>}
                    </div>
                  </div>
                )}

                <div className="p-4 space-y-2 min-h-[160px]">
                  {selected.messages.map(m => {
                    if (m.systemKind) return <p key={m.id} className="text-[11px] text-center text-on-surface-variant bg-surface-container-high rounded-xl px-3 py-2">{exText(selected, m.systemKind)}</p>;
                    const mineMsg = m.senderId === who;
                    return (
                      <div key={m.id} className={`flex ${mineMsg ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs ${mineMsg ? 'bg-primary text-on-primary' : 'bg-surface-container-high'}`}>
                          <p className="text-[10px] opacity-70 mb-0.5">{studentById(m.senderId as StudentId).nick}</p>
                          {CHAT_PRESET_BY_ID[m.presetId!]?.text}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!['declined', 'cancelled', 'completed'].includes(selected.status) && (
                  <div className="border-t border-outline-variant/30 p-3 space-y-2">
                    <div className="flex gap-1.5 overflow-x-auto">
                      {(Object.keys(CHAT_PRESET_GROUPS) as ChatPreset['group'][]).map(g => (
                        <button key={g} onClick={() => setGroup(g)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer ${group === g ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-on-surface-variant'}`}>{CHAT_PRESET_GROUPS[g]}</button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {CHAT_PRESETS.filter(p => p.group === group).map(p => (
                        <button key={p.id} onClick={() => apply(sendPreset(state, who, selected.id, p.id))} className="px-3 py-2 rounded-2xl bg-primary text-on-primary text-xs text-left cursor-pointer">{p.text}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : <div className="bg-surface-container rounded-2xl p-8 text-center text-xs text-on-surface-variant">Escolha uma conversa ao lado.</div>}
          </div>
        )}

        {tab === 'estante' && (
          <div className="space-y-3">
            {shelfOf(state, who).map(b => {
              const borrowed = b.ownerId !== who;
              const pct = Math.round((b.pagesRead / b.totalPages) * 100);
              return (
                <div key={b.id} className="bg-surface-container rounded-2xl p-4 flex gap-3 items-center">
                  <div className="w-14 h-16 rounded-xl bg-primary-container flex items-center justify-center text-2xl shrink-0">{b.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-primary">{b.title}</h3>
                    <p className="text-[11px] text-on-surface-variant">{borrowed ? `📖 Emprestado de ${studentById(b.ownerId).nick}` : b.status === 'borrowed' ? `Emprestado para ${studentById(b.currentReaderId!).nick}` : b.status === 'available' ? 'Compartilhado no grupo' : 'Com você'}</p>
                    <div className="h-2 rounded-full bg-surface-container-high mt-2"><div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                    <p className="text-[10px] text-on-surface-variant mt-1">{b.pagesRead} / {b.totalPages} páginas</p>
                  </div>
                  {borrowed && (
                    <div className="flex gap-1 items-center">
                      <input type="number" min={0} max={b.totalPages} value={pages[b.id] ?? ''} onChange={e => setPages(p => ({ ...p, [b.id]: e.target.value }))}
                        placeholder="pág." aria-label="Páginas lidas" className="w-16 rounded-lg bg-surface-container-high px-2 py-1 text-xs" />
                      <button onClick={() => apply(saveProgress(state, who, b.id, Number(pages[b.id])))} className="px-3 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-bold cursor-pointer">Salvar</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <section className="bg-surface-container rounded-2xl p-4">
          <h2 className="text-xs font-bold text-primary mb-2">Registro do que aconteceu</h2>
          {state.log.length === 0 ? <p className="text-[11px] text-on-surface-variant">Nada ainda. Peça um livro emprestado!</p> :
            <ul className="space-y-1">{state.log.slice(0, 8).map((l, i) => <li key={i} className="text-[11px] text-on-surface-variant">• {l.text}</li>)}</ul>}
        </section>
      </main>
    </div>
  );
}
