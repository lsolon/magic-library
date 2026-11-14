import React, { useState } from 'react';
import { Star, X, Lock } from 'lucide-react';
import { FEELINGS, NOTE_MAX, ReadingRecordInput } from '../lib/readingLog';
import { cn } from '../lib/utils';

interface Props {
  bookTitle: string;
  initial?: Partial<ReadingRecordInput> | null;
  saving?: boolean;
  onSave: (input: ReadingRecordInput) => void;
  onClose: () => void;
}

/** Registro de leitura: nota, sentimento e uma frase privada. Vale o bônus de conclusão. */
export function ReadingRecordModal({ bookTitle, initial, saving, onSave, onClose }: Props) {
  const [rating, setRating] = useState<number>(initial?.rating || 0);
  const [feeling, setFeeling] = useState<string>(initial?.feeling || '');
  const [note, setNote] = useState<string>(initial?.note || '');

  const canSave = rating >= 1 && !!feeling && !saving;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md bg-surface-container-high rounded-[2rem] border-2 border-secondary-container shadow-xl p-6 space-y-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-headline-md text-primary font-bold">Registre sua leitura</h3>
            <p className="text-sm text-on-surface-variant mt-1">
              Você terminou <strong>{bookTitle}</strong>! Conte rapidinho como foi e ganhe o bônus de conclusão.
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-2 rounded-full hover:bg-surface-variant cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <p className="font-label-lg text-on-surface mb-2">Quantas estrelas você dá?</p>
          <div className="flex gap-1" role="radiogroup" aria-label="Nota de 1 a 5">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
                aria-checked={rating === n}
                role="radio"
                className="p-1 cursor-pointer"
              >
                <Star className={cn('w-8 h-8 transition-colors', n <= rating ? 'text-tertiary fill-tertiary' : 'text-outline')} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="font-label-lg text-on-surface mb-2">Como foi essa leitura?</p>
          <div className="flex flex-wrap gap-2">
            {FEELINGS.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFeeling(f.id)}
                className={cn(
                  'px-3 py-2 rounded-full border-2 text-sm font-semibold transition-all cursor-pointer',
                  feeling === f.id
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-surface-container-low border-surface-variant text-on-surface hover:border-primary'
                )}
              >
                {f.emoji} {f.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="reading-note" className="font-label-lg text-on-surface mb-2 block">
            Uma frase sobre o livro <span className="text-on-surface-variant font-normal">(opcional)</span>
          </label>
          <textarea
            id="reading-note"
            value={note}
            maxLength={NOTE_MAX}
            onChange={e => setNote(e.target.value)}
            rows={3}
            className="w-full bg-surface-container-low border-2 border-surface-variant rounded-2xl py-3 px-4 text-on-background focus:outline-none focus:border-primary"
            placeholder="O que mais gostou? Qual foi a melhor parte?"
          />
          <div className="flex items-center justify-between mt-1 text-xs text-on-surface-variant">
            <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Privado: seus colegas não veem esta frase.</span>
            <span>{note.length}/{NOTE_MAX}</span>
          </div>
        </div>

        <button
          onClick={() => canSave && onSave({ rating, feeling, note })}
          disabled={!canSave}
          className="w-full bg-primary text-on-primary font-label-lg py-3.5 rounded-2xl shadow-md hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
        >
          {saving ? 'Salvando...' : 'Salvar registro'}
        </button>
        {!canSave && !saving && (
          <p className="text-xs text-on-surface-variant text-center -mt-2">Escolha as estrelas e como foi a leitura para salvar.</p>
        )}
      </div>
    </div>
  );
}
