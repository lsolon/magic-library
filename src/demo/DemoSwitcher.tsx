import React from 'react';
import { DEMO_USERS } from './seed';
import { demoCurrentId, demoSwitchUser } from './fakeAuth';
import { resetDemoDb } from './fakeFirestore';

/** Barra flutuante do ambiente de demonstração: troca de aluno e reinício. */
export default function DemoSwitcher() {
  const me = demoCurrentId();
  const go = (id: string) => { demoSwitchUser(id); window.location.hash = '#/dashboard'; window.location.reload(); };
  return (
    <div className="fixed left-2 bottom-[84px] md:bottom-3 z-[100] max-w-[calc(100vw-16px)] bg-[#1a1040]/95 border border-primary/40 rounded-2xl shadow-xl px-3 py-2 text-[11px] text-white backdrop-blur">
      <p className="font-bold mb-1">🧪 Demonstração · dados fictícios</p>
      <div className="flex gap-1.5 items-center flex-wrap">
        {DEMO_USERS.map(u => (
          <button key={u.uid} onClick={() => go(u.uid)} aria-pressed={me === u.uid}
            className={`px-3 py-1 rounded-full font-bold cursor-pointer ${me === u.uid ? 'bg-primary text-on-primary' : 'bg-white/10 hover:bg-white/20'}`}>
            {u.displayName} <span className="opacity-70 font-normal">· {u.grade}</span>
          </button>
        ))}
        <button onClick={() => { if (window.confirm('Zerar a demonstração?')) { resetDemoDb(); window.location.hash = '#/dashboard'; window.location.reload(); } }}
          className="px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 cursor-pointer" title="Reiniciar">↺</button>
      </div>
    </div>
  );
}
