import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Trash2, Plus, X, Library } from 'lucide-react';
import type { Elemento } from '../types';
import { computeNvp, noleggiRows, type NvpRow, type VoceChoice } from '../services/pricing';
import { VocePickerDialog } from './VocePickerDialog';

interface Material {
  id: string;
  descrizione: string;
  um: string;
  quantita: number;
  prezzoUnitario: number;
}

interface NvpBuilderProps {
  elemento: Elemento | { descrizioneElemento: string, edifcio: string, livello: string, descricao: string, edificio: string };
  initialNvpDetails?: any;
  onConfirm: (valoreUnitario: number, originePrezzo: string, nvpDetails: any) => void;
  onSkip: () => void;
}

export function NvpBuilderModal({ elemento, initialNvpDetails, onConfirm, onSkip }: NvpBuilderProps) {
  const [materiali, setMateriali] = useState<Material[]>(initialNvpDetails?.materiali || [
    { id: '1', descrizione: elemento.descricao || (elemento as any).descrizioneElemento, um: 'cad', quantita: 1, prezzoUnitario: 0 }
  ]);
  const [scontoPercentuale, setScontoPercentuale] = useState(initialNvpDetails?.scontoPercentuale ?? 0);
  
  const [manoDOpera, setManoDOpera] = useState<NvpRow[]>(initialNvpDetails?.manoDOpera || []);
  
  const [noleggi, setNoleggi] = useState<NvpRow[]>(() => noleggiRows(initialNvpDetails));
  const [picker, setPicker] = useState<{ section: 'mo' | 'nol'; rowId: string | null } | null>(null);
  const [trasportiPercentuale, setTrasportiPercentuale] = useState(initialNvpDetails?.trasportiPercentuale ?? 3);
  const [speseGeneraliPercentuale, setSpeseGeneraliPercentuale] = useState(initialNvpDetails?.speseGeneraliPercentuale ?? 15);
  const [utiliPercentuale, setUtiliPercentuale] = useState(initialNvpDetails?.utiliPercentuale ?? 10);
  
  const [fonte, setFonte] = useState(initialNvpDetails?.fonte || '');

  // Calcoli: stessa formula condivisa con Analisi Prezzi (services/pricing.ts)
  const { totaleA, totaleScontato, totaleB, totaleC, totaleD, totaleE, totaleF, totaleG, totaleFinale } = useMemo(
    () => computeNvp({ materiali, scontoPercentuale, manoDOpera, noleggi, trasportiPercentuale, speseGeneraliPercentuale, utiliPercentuale }),
    [materiali, scontoPercentuale, manoDOpera, noleggi, trasportiPercentuale, speseGeneraliPercentuale, utiliPercentuale],
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6 overflow-y-auto">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white dark:bg-[#0A1628] border border-[#E94560]/30 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col my-auto max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-300 dark:border-white/10 shrink-0">
          <div>
            <div className="text-xs font-bold tracking-widest text-[#E94560] uppercase mb-1">ANALISI NUOVO PREZZO</div>
            <h3 className="text-gray-900 dark:text-white text-xl font-bold">{elemento.descricao || (elemento as any).descrizioneElemento}</h3>
            <p className="text-gray-500 dark:text-white/40 text-sm">NVP · {elemento.edificio} / {elemento.livello}</p>
          </div>
          <button onClick={onSkip} className="text-gray-500 dark:text-white/40 hover:text-gray-900 dark:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* A. Materiali */}
          <section>
            <div className="flex justify-between items-center bg-[#E94560]/10 px-4 py-2 border-l-4 border-[#E94560] mb-4">
              <h4 className="text-[#E94560] font-bold text-sm tracking-widest uppercase">A. Materiali</h4>
              <span className="text-gray-900 dark:text-white font-bold">€ {totaleA.toFixed(2)}</span>
            </div>
            
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_80px_100px_120px_120px_40px] gap-2 text-xs font-bold text-gray-500 dark:text-white/40 uppercase tracking-wider px-2">
                <div>Descrizione</div>
                <div>U.M.</div>
                <div>Quantità</div>
                <div>Prezzo Un.</div>
                <div>Prezzo Tot.</div>
                <div></div>
              </div>
              {materiali.map(mat => (
                <div key={mat.id} className="grid grid-cols-[1fr_80px_100px_120px_120px_40px] gap-2 items-center">
                  <input type="text" value={mat.descrizione} onChange={e => setMateriali(m => m.map(x => x.id === mat.id ? { ...x, descrizione: e.target.value } : x))} className="bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm" />
                  <input type="text" value={mat.um} onChange={e => setMateriali(m => m.map(x => x.id === mat.id ? { ...x, um: e.target.value } : x))} className="bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm" />
                  <input type="number" step="0.01" value={mat.quantita || ''} onChange={e => setMateriali(m => m.map(x => x.id === mat.id ? { ...x, quantita: parseFloat(e.target.value) || 0 } : x))} className="bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm" />
                  <input type="number" step="0.01" value={mat.prezzoUnitario || ''} onChange={e => setMateriali(m => m.map(x => x.id === mat.id ? { ...x, prezzoUnitario: parseFloat(e.target.value) || 0 } : x))} className="bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm" />
                  <div className="px-3 py-2 text-gray-900 dark:text-white text-sm">€ {(mat.quantita * mat.prezzoUnitario).toFixed(2)}</div>
                  <button onClick={() => setMateriali(m => m.filter(x => x.id !== mat.id))} className="text-red-400 hover:text-red-300 mx-auto"><Trash2 size={16} /></button>
                </div>
              ))}
              <button onClick={() => setMateriali(m => [...m, { id: Date.now().toString(), descrizione: '', um: 'cad', quantita: 1, prezzoUnitario: 0 }])} className="text-xs text-[#E94560] font-bold tracking-widest uppercase flex items-center gap-1 hover:text-gray-900 dark:text-white transition-colors mt-2">
                <Plus size={14} /> Aggiungi Materiale
              </button>
            </div>
            
            <div className="flex items-center gap-4 mt-4 bg-gray-100 dark:bg-white/5 p-3 rounded-lg w-fit ml-auto">
              <span className="text-sm text-gray-600 dark:text-white/60">Sconto %</span>
              <input type="number" value={scontoPercentuale || ''} onChange={e => setScontoPercentuale(parseFloat(e.target.value) || 0)} className="bg-white dark:bg-[#0A1628] border border-gray-300 dark:border-white/10 rounded px-2 py-1 text-gray-900 dark:text-white text-sm w-20" />
              <span className="text-gray-900 dark:text-white font-bold ml-4">Totale Scontato: € {totaleScontato.toFixed(2)}</span>
            </div>
          </section>

          {/* B. Mano d'opera */}
          <section>
            <div className="flex justify-between items-center bg-[#E94560]/10 px-4 py-2 border-l-4 border-[#E94560] mb-4">
              <h4 className="text-[#E94560] font-bold text-sm tracking-widest uppercase">B. Mano d'opera</h4>
              <span className="text-gray-900 dark:text-white font-bold">€ {totaleB.toFixed(2)}</span>
            </div>
            <PriceRows rows={manoDOpera} setRows={setManoDOpera} defaultUm="ora" onPick={rowId => setPicker({ section: 'mo', rowId })} />
          </section>

          {/* C. Noleggi */}
          <section>
                <div className="flex justify-between items-center bg-[#E94560]/10 px-4 py-2 border-l-4 border-[#E94560] mb-4">
                  <h4 className="text-[#E94560] font-bold text-sm tracking-widest uppercase">C. Noleggi</h4>
                  <span className="text-gray-900 dark:text-white font-bold">€ {totaleC.toFixed(2)}</span>
                </div>
                <PriceRows rows={noleggi} setRows={setNoleggi} defaultUm="ora" onPick={rowId => setPicker({ section: 'nol', rowId })} />
              </section>

          <div className="grid grid-cols-2 gap-8">
            {/* C. Noleggi & D. Trasporti */}
            <div className="space-y-8">

              <section>
                <div className="flex justify-between items-center bg-[#E94560]/10 px-4 py-2 border-l-4 border-[#E94560] mb-4">
                  <h4 className="text-[#E94560] font-bold text-sm tracking-widest uppercase">D. Trasporti</h4>
                  <span className="text-gray-900 dark:text-white font-bold">€ {totaleD.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600 dark:text-white/60">% di A (Materiale)</span>
                  <input type="number" step="0.01" value={trasportiPercentuale || ''} onChange={e => setTrasportiPercentuale(parseFloat(e.target.value) || 0)} className="bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm w-32" />
                </div>
              </section>
            </div>

            {/* F. Spese Generali & G. Utili */}
            <div className="space-y-8">
              <section>
                <div className="flex justify-between items-center bg-[#E94560]/10 px-4 py-2 border-l-4 border-[#E94560] mb-4">
                  <h4 className="text-[#E94560] font-bold text-sm tracking-widest uppercase">F. Spese Generali</h4>
                  <span className="text-gray-900 dark:text-white font-bold">€ {totaleF.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600 dark:text-white/60">% di E (Totale dei Costi)</span>
                  <input type="number" step="0.01" value={speseGeneraliPercentuale || ''} onChange={e => setSpeseGeneraliPercentuale(parseFloat(e.target.value) || 0)} className="bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm w-32" />
                </div>
              </section>

              <section>
                <div className="flex justify-between items-center bg-[#E94560]/10 px-4 py-2 border-l-4 border-[#E94560] mb-4">
                  <h4 className="text-[#E94560] font-bold text-sm tracking-widest uppercase">G. Utili D'impresa</h4>
                  <span className="text-gray-900 dark:text-white font-bold">€ {totaleG.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600 dark:text-white/60">% di E + F</span>
                  <input type="number" step="0.01" value={utiliPercentuale || ''} onChange={e => setUtiliPercentuale(parseFloat(e.target.value) || 0)} className="bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm w-32" />
                </div>
              </section>
            </div>
          </div>
          
          <div className="pt-6 border-t border-gray-300 dark:border-white/10">
            <label className="text-xs text-gray-500 dark:text-white/40 font-bold uppercase tracking-widest block mb-2">Fonte / Riferimento</label>
            <input type="text" value={fonte} onChange={e => setFonte(e.target.value)} placeholder="Es: Preventivo fornitore X..." className="w-full bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:outline-none focus:border-[#E94560]/50" />
          </div>

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-300 dark:border-white/10 bg-black/20 shrink-0 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500 dark:text-white/40 font-bold uppercase tracking-widest mb-1">E. Totale del Costo: € {totaleE.toFixed(2)}</div>
            <div className="text-[#E94560] font-black text-2xl">Totale Finale: € {totaleFinale.toFixed(2)}</div>
          </div>
          <div className="flex gap-3">
            <button onClick={onSkip} className="px-6 py-3 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:bg-white/10 text-gray-900 dark:text-white rounded-xl text-sm font-bold transition-colors">
              SALTA NVP
            </button>
            <button 
              onClick={() => onConfirm(totaleFinale, fonte || 'Analisi Prezzo NVP', { materiali, scontoPercentuale, manoDOpera, noleggi, trasportiPercentuale, speseGeneraliPercentuale, utiliPercentuale, fonte })} 
              className="px-8 py-3 bg-gradient-to-r from-[#0F3460] to-[#E94560] text-gray-900 dark:text-white rounded-xl text-sm font-black tracking-widest uppercase hover:opacity-90 transition-opacity"
            >
              CONFERMA NVP
            </button>
          </div>
        </div>
        
      </motion.div>

      {picker && (
        <VocePickerDialog
          title={picker.section === 'mo' ? "Seleziona mano d'opera dal prezzario" : 'Seleziona noleggio dal prezzario'}
          initialQuery={picker.section === 'mo' ? 'operaio' : 'noleggio'}
          onClose={() => setPicker(null)}
          onPick={(v: VoceChoice) => {
            const patch = { descrizione: v.descrizione, um: v.um, prezzoUnitario: v.valore, codice: v.codice, prezzario: v.prezzarioNome };
            const setter = picker.section === 'mo' ? setManoDOpera : setNoleggi;
            setter(rows => picker.rowId
              ? rows.map(r => r.id === picker.rowId ? { ...r, ...patch } : r)
              : [...rows, { id: Date.now().toString(), quantita: 1, ...patch }]);
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}

const cellCls = 'bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm';

// Righe di costo (manodopera / noleggi): selezione dal prezzario oppure inserimento manuale.
function PriceRows({ rows, setRows, defaultUm, onPick }: {
  rows: NvpRow[];
  setRows: React.Dispatch<React.SetStateAction<NvpRow[]>>;
  defaultUm: string;
  onPick: (rowId: string | null) => void;
}) {
  const upd = (id: string, patch: Partial<NvpRow>) => setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  // Modificando a mano descrizione/UM/prezzo la riga non è più "dal prezzario"
  const manual = { codice: undefined, prezzario: undefined };
  const cols = 'grid-cols-[1fr_80px_100px_120px_120px_40px_40px]';
  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className={`grid ${cols} gap-2 text-xs font-bold text-gray-500 dark:text-white/40 uppercase tracking-wider px-2`}>
          <div>Descrizione</div><div>U.M.</div><div>Quantità</div><div>Prezzo Un.</div><div>Prezzo Tot.</div><div></div><div></div>
        </div>
      )}
      {rows.map(row => (
        <div key={row.id}>
          <div className={`grid ${cols} gap-2 items-center`}>
            <input type="text" value={row.descrizione} onChange={e => upd(row.id, { descrizione: e.target.value, ...manual })} className={cellCls} />
            <input type="text" value={row.um} onChange={e => upd(row.id, { um: e.target.value, ...manual })} className={cellCls} />
            <input type="number" step="0.01" value={row.quantita || ''} onChange={e => upd(row.id, { quantita: parseFloat(e.target.value) || 0 })} className={cellCls} />
            <input type="number" step="0.01" value={row.prezzoUnitario || ''} onChange={e => upd(row.id, { prezzoUnitario: parseFloat(e.target.value) || 0, ...manual })} className={cellCls} />
            <div className="px-3 py-2 text-gray-900 dark:text-white text-sm">€ {(row.quantita * row.prezzoUnitario).toFixed(2)}</div>
            <button onClick={() => onPick(row.id)} className="text-[#E94560] hover:text-gray-900 dark:hover:text-white mx-auto" title="Seleziona dal prezzario"><Library size={16} /></button>
            <button onClick={() => setRows(rs => rs.filter(x => x.id !== row.id))} className="text-red-400 hover:text-red-300 mx-auto" title="Rimuovi"><Trash2 size={16} /></button>
          </div>
          {row.codice && (
            <p className="text-[10px] text-gray-500 dark:text-white/40 px-2 mt-0.5">
              Da prezzario: <span className="font-mono">{row.codice}</span> · {row.prezzario}
            </p>
          )}
        </div>
      ))}
      <div className="flex gap-5 mt-2">
        <button onClick={() => onPick(null)} className="text-xs text-[#E94560] font-bold tracking-widest uppercase flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
          <Library size={14} /> Aggiungi dal prezzario
        </button>
        <button onClick={() => setRows(rs => [...rs, { id: Date.now().toString(), descrizione: '', um: defaultUm, quantita: 1, prezzoUnitario: 0 }])} className="text-xs text-gray-500 dark:text-white/50 font-bold tracking-widest uppercase flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
          <Plus size={14} /> Aggiungi manuale
        </button>
      </div>
    </div>
  );
}
