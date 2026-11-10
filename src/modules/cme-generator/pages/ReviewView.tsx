// Revisione: riepilogo dell'elaborazione e elenco delle sole voci da verificare (ALERT e NON TROVATO).
// Gli elementi OK e NVP non richiedono controlli qui: le NVP si completano da Analisi Prezzi e le voci
// non trovate si correggono da Elenco Prezzi o con l'assistente IA.
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Search, XCircle } from 'lucide-react';
import { useCme } from '../context/CmeContext';
import { hierarchyPath } from '../lib/hierarchy';
import { eur } from '../lib/format';
import { matchesQuery } from '../lib/search';

interface ReviewViewProps {
  onFinish: () => void; // vai ai Risultati
}

type Tab = 'alert' | 'nao';
const MAX_ROWS = 200;

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`flex flex-col items-center px-5 py-3 rounded-xl border ${tone}`}>
      <span className="text-2xl font-black">{value.toLocaleString('it-IT')}</span>
      <span className="text-xs uppercase tracking-widest opacity-60 mt-0.5">{label}</span>
    </div>
  );
}

export function ReviewView({ onFinish }: ReviewViewProps) {
  const { state, getAllEffectiveResults, hierarchy, totalAmount } = useCme();
  const results = useMemo(() => getAllEffectiveResults(), [getAllEffectiveResults]);

  const [tabChoice, setTab] = useState<Tab>('alert');
  const [filter, setFilter] = useState('');
  const [verified, setVerified] = useState<Set<string>>(new Set()); // checklist di sessione (non si salva)

  const alerts = useMemo(() => results.filter(r => r.status === 'ALERT'), [results]);
  const notFound = useMemo(() => results.filter(r => r.status === 'NAO_ENCONTRADO'), [results]);
  const nOk = results.filter(r => r.status === 'OK').length;
  const nNvp = results.filter(r => r.status === 'NVP').length;

  // se una sola categoria ha voci, mostra quella
  const tab: Tab = tabChoice === 'alert' && alerts.length === 0 && notFound.length > 0 ? 'nao' : tabChoice;
  const list = useMemo(
    () => (tab === 'alert' ? alerts : notFound).filter(r => matchesQuery([r.descrizioneElemento, r.categoria, r.notes, ...hierarchyPath(r, hierarchy)], filter)),
    [tab, alerts, notFound, filter, hierarchy],
  );

  const pending = alerts.filter(r => !verified.has(r.idElemento));
  const toVerify = alerts.length + notFound.length;
  const toggle = (id: string) => setVerified(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const approveAll = () => setVerified(prev => new Set([...prev, ...list.filter(r => r.status === 'ALERT').map(r => r.idElemento)]));
  const pendingInView = list.filter(r => r.status === 'ALERT' && !verified.has(r.idElemento)).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-8 py-5 border-b border-gray-200 dark:border-white/5 bg-white dark:bg-[#080C14]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-gray-900 dark:text-white font-black text-lg tracking-tight">Revisione</h2>
            <p className="text-gray-500 dark:text-white/40 text-xs mt-0.5">
              {toVerify === 0
                ? '✓ Nessuna voce da verificare'
                : `${toVerify} ${toVerify === 1 ? 'voce da verificare' : 'voci da verificare'}${alerts.length ? ` · ${pending.length} alert ancora aperti` : ''}`}
            </p>
          </div>
          <button
            onClick={onFinish}
            disabled={state.resultados.size === 0}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-[#0F3460] to-[#E94560] text-white font-bold text-sm transition-all disabled:opacity-50"
          >
            Vai ai Risultati <ArrowRight size={14} />
          </button>
        </div>

        <div className="flex flex-wrap gap-3 mt-4">
          <Stat label="Elementi" value={results.length} tone="border-gray-300 dark:border-white/10 text-gray-600 dark:text-white/60" />
          <Stat label="OK" value={nOk} tone="border-green-500/20 text-green-500" />
          <Stat label="NVP" value={nNvp} tone="border-cyan-500/20 text-cyan-500" />
          <Stat label="Alert" value={alerts.length} tone="border-yellow-500/20 text-yellow-500" />
          <Stat label="Non trovati" value={notFound.length} tone="border-red-500/20 text-red-500" />
          <div className="flex-1" />
          <div className="flex flex-col items-end justify-center">
            <span className="text-xs uppercase tracking-widest opacity-50">Importo</span>
            <span className="text-xl font-black text-[#E94560]">{eur(totalAmount)}</span>
          </div>
        </div>
      </div>

      {toVerify === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 dark:text-white/30">
          <CheckCircle2 size={44} className="text-green-500/70" />
          <p className="text-sm">Tutte le voci hanno un prezzo.{nNvp > 0 ? ' Completa le analisi delle NVP da Analisi Prezzi.' : ''}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 px-8 py-3 border-b border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-[#060A12]">
            {([
              { id: 'alert', label: `⚠ Alert (${alerts.length})`, show: alerts.length > 0 },
              { id: 'nao', label: `✗ Non trovati (${notFound.length})`, show: notFound.length > 0 },
            ] as const).filter(t => t.show).map(t => (
              <button
                key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-lg text-xs font-bold tracking-widest uppercase transition-all ${tab === t.id ? 'bg-gray-200 dark:bg-white/10 text-gray-900 dark:text-white' : 'text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60'}`}
              >{t.label}</button>
            ))}
            <div className="relative ml-2">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
              <input
                value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filtra…"
                className="bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs w-52 focus:outline-none"
              />
            </div>
            {tab === 'alert' && (
              <button
                onClick={approveAll} disabled={pendingInView === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/30 text-yellow-700 dark:text-yellow-400 text-xs font-bold transition-colors ml-2 disabled:opacity-40"
              >
                <CheckCircle2 size={13} /> Approva Tutti ALERT ({pendingInView.toLocaleString('it-IT')})
              </button>
            )}
          </div>

          <div className="flex-1 overflow-auto px-8 py-5 space-y-2">
            {list.slice(0, MAX_ROWS).map(r => {
              const isAlert = r.status === 'ALERT';
              const done = verified.has(r.idElemento);
              return (
                <div
                  key={r.idElemento}
                  className={`flex items-start gap-4 border rounded-xl px-5 py-3 ${isAlert ? (done ? 'border-green-500/30 bg-green-900/10' : 'border-yellow-500/30 bg-yellow-900/10') : 'border-red-500/30 bg-red-900/10'}`}
                >
                  {isAlert ? <AlertTriangle size={16} className="mt-0.5 text-yellow-500 shrink-0" /> : <XCircle size={16} className="mt-0.5 text-red-500 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{r.descrizioneElemento}</p>
                    <p className="text-xs text-gray-500 dark:text-white/40 truncate">{hierarchyPath(r, hierarchy).join(' › ')}</p>
                    {r.notes && <p className="text-xs mt-1 text-red-500/90">{r.notes}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-700 dark:text-white/70">{eur(r.total)}</p>
                    <p className="text-[10px] opacity-50">{r.quantitaElemento} {r.unidade}</p>
                  </div>
                  {isAlert && (
                    <button
                      onClick={() => toggle(r.idElemento)}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-colors ${done ? 'border-green-500/40 text-green-500' : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10'}`}
                    >{done ? '✓ Verificata' : 'Verificata'}</button>
                  )}
                </div>
              );
            })}
            {list.length > MAX_ROWS && (
              <p className="text-gray-500 dark:text-white/30 text-xs py-4 text-center">
                + {(list.length - MAX_ROWS).toLocaleString('it-IT')} elementi aggiuntivi: usa il filtro per restringere l'elenco
              </p>
            )}
            {list.length === 0 && <p className="text-center text-sm opacity-40 py-12">Nessun elemento corrisponde al filtro.</p>}
          </div>
        </>
      )}
    </div>
  );
}
