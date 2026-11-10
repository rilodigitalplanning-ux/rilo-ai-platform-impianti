// src/modules/cmeGenerator/pages/ProcessingView.tsx
import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import { buildNvpResult } from '../services/claudeService';
import { loadVoci } from '../services/prezzarioService';
import { useCme } from '../context/CmeContext';
import { NvpBuilderModal } from '../components/NvpBuilderModal';
import { buildResultFromComponenti, collectNvpCodes, nvpCodeKey, voceKey, type NvpAnalysis } from '../services/cmeBuilder';
import type { Elemento, PrezzarioVoce, ResultadoItem } from '../types';

interface ProcessingViewProps {
  targetPrezzarioId: number;
  targetPrezzarioName: string;
  onDone: () => void;
}

interface NvpModalState {
  elemento: Elemento;
  resolve: (value: { valoreUnitario: number; originePrezzo: string; nvpDetails: any }) => void;
}

export function ProcessingView({
  targetPrezzarioId,
  targetPrezzarioName,
  onDone,
}: ProcessingViewProps) {
  const { state, dispatch } = useCme();
  const [log, setLog] = useState<Array<{ text: string; type: 'ok' | 'alert' | 'err' | 'info' }>>([]);
  const [nvpModal, setNvpModal] = useState<NvpModalState | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const runRef = useRef(false);

  const addLog = (text: string, type: 'ok' | 'alert' | 'err' | 'info' = 'info') =>
    setLog(prev => [...prev.slice(-200), { text, type }]);

  async function askNvp(elemento: Elemento): Promise<{ valoreUnitario: number; originePrezzo: string; nvpDetails: any }> {
    return new Promise(resolve => setNvpModal({ elemento, resolve }));
  }

  useEffect(() => {
    if (runRef.current) return;
    runRef.current = true;

    (async () => {
      dispatch({ type: 'SET_PROCESSING', payload: true });
      addLog('Caricamento del prezzario da Supabase...', 'info');

      // Load target prezzario voci
      const targetVoci: PrezzarioVoce[] = await loadVoci(targetPrezzarioId);
      addLog(`✓ ${targetVoci.length} voci caricate nel prezzario di destinazione`, 'ok');

      if (targetVoci.length === 0) {
        addLog('⚠ Prezzario di destinazione vuoto — verificare le Impostazioni.', 'err');
        dispatch({ type: 'SET_PROCESSING', payload: false });
        return;
      }

      // ── Scheda CME (composizioni fino a 5 voci, NVP riconosciute dal codice) ──
      if (state.elementos.some(e => e.componenti)) {
        const voci = new Map<string, PrezzarioVoce>();
        for (const v of targetVoci) if (!voci.has(voceKey(v.codice))) voci.set(voceKey(v.codice), v);

        const nvpCodes = collectNvpCodes(state.elementos);
        const nvps = new Map<string, NvpAnalysis>();
        if (nvpCodes.length > 0) {
          addLog(`${nvpCodes.length} codici NVP da analizzare (una analisi per codice, riusata su tutti gli elementi).`, 'alert');
          for (const n of nvpCodes) {
            const pseudo = {
              idUnico: n.codice, edificio: `${n.nElementi} elementi`, livello: n.codice, zona: '',
              descricao: n.descrizione, tariffa: n.codice, quantita: 1, fatorWBS: 1, countRevit: 1,
            } as Elemento;
            const a = await askNvp(pseudo);
            nvps.set(nvpCodeKey(n.codice), a);
            addLog(`✓ NVP ${n.codice} → €${a.valoreUnitario.toFixed(2)}`, 'ok');
          }
        }

        for (let i = 0; i < state.elementos.length; i++) {
          const el = state.elementos[i];
          dispatch({ type: 'SET_PROGRESS', payload: { current: i + 1, total: state.elementos.length, message: `${el.descricao.slice(0, 40)}...` } });
          const result = buildResultFromComponenti(el, voci, nvps, targetPrezzarioName);
          dispatch({ type: 'ADD_RESULTADO', payload: result });
          if (result.status === 'NAO_ENCONTRADO') addLog(`✗ ${el.descricao.slice(0, 35)} — ${result.notes}`, 'err');
        }

        dispatch({ type: 'SET_PROCESSING', payload: false });
        addLog('✓ Elaborazione completata! Vai ai Risultati.', 'ok');
        setTimeout(onDone, 1200);
        return;
      }

      // Classify elementos:
      // - If CSV has TipoPrezzo column → use it explicitly ('NVP' or 'PREZZARIO')
      // - If not → detect NVP by checking if tariffa is blank or starts with 'nvp'
      const hasTipoCol = state.elementos.some(e => e.tipoPrezzo !== undefined);
      const NVP_MARKERS = new Set(['nvp', 'nenhum', 'none', 'n/a', '-', '']);

      const toProcess: Elemento[] = [];
      const nvpItems: Elemento[]  = [];

      for (const el of state.elementos) {
        const isNvp = hasTipoCol
          ? el.tipoPrezzo?.toUpperCase() === 'NVP'
          : NVP_MARKERS.has(el.tariffa.toLowerCase().trim()) || el.tariffa.toLowerCase().startsWith('nvp');

        if (isNvp) nvpItems.push(el);
        else toProcess.push(el);
      }

      addLog(
        `${state.elementos.length} elementi: ${toProcess.length} da elaborare, ${nvpItems.length} NVP.`,
        'info'
      );

      // ── Process normal elementos — exact code lookup (no AI) ──────────────
      //
      // Logic: for each elemento, look up elemento.tariffa EXACTLY in
      // the target prezzario voci (case-insensitive). No fuzzy, no AI.
      // Found → OK, valore from prezzario. Not found → NAO_ENCONTRADO.
      //
      const processedResults: ResultadoItem[] = [];

      for (let i = 0; i < toProcess.length; i++) {
        const el = toProcess[i];

        dispatch({
          type: 'SET_PROGRESS',
          payload: {
            current: i + 1,
            total: state.elementos.length,
            message: `${el.descricao.slice(0, 40)}...`,
          },
        });

        const tariffaKey1 = (el.tariffa || '').trim().toLowerCase();
        const tariffaKey2 = (el.tariffa2 || '').trim().toLowerCase();

        const voce1 = targetVoci.find(v => v.codice.trim().toLowerCase() === tariffaKey1);
        const voce2 = el.tariffa2 ? targetVoci.find(v => v.codice.trim().toLowerCase() === tariffaKey2) : undefined;

        let result: ResultadoItem;

        if (el.tariffa2) {
          // Composite element (composition with multiple items, e.g. Torretta)
          if (voce1 && voce2) {
            const val1 = voce1.valore;
            const val2 = voce2.valore;
            const factor1 = el.fatorWBS || 1;
            const factor2 = el.fatorWBS2 || 1;

            const compositeValoreUnitario = (val1 * factor1) + (val2 * factor2);
            const total = parseFloat((compositeValoreUnitario * el.countRevit).toFixed(2));

            result = {
              idElemento:          el.idUnico,
              edificio:            el.edificio,
              livello:             el.livello,
              zona:                el.zona,
              categoria:           voce1.categoria || voce2.categoria || 'Generale',
              descrizioneElemento: el.descricao,
              tipoPrezzo:          'misura',
              quantitaElemento:    el.countRevit, // The count of Torrettas (e.g., 5)
              unidade:             el.unidade || '', // Revit unit
              valoreUnitario:      compositeValoreUnitario, // PU considering composition
              total,
              originePrezzo:       targetPrezzarioName,
              status:              'OK',
              subItems: [
                {
                  codiceDeiOriginal:          el.tariffa,
                  descrizioneDei:             el.descricao,
                  codicePrezzarioTarget:      voce1.codice,
                  descrizionePrezzarioTarget: voce1.descrizione,
                  confiancaMatch:             1.0,
                  quantitaComposizione:       factor1, // composition factor
                  valoreUnitario:             val1,
                  status:                     'OK',
                  unidade:                    voce1.um || 'cad',
                },
                {
                  codiceDeiOriginal:          el.tariffa2,
                  descrizioneDei:             el.descricao,
                  codicePrezzarioTarget:      voce2.codice,
                  descrizionePrezzarioTarget: voce2.descrizione,
                  confiancaMatch:             1.0,
                  quantitaComposizione:       factor2,
                  valoreUnitario:             val2,
                  status:                     'OK',
                  unidade:                    voce2.um || 'cad',
                }
              ],
              tipoImpianto:        el.tipoImpianto,
            };
            addLog(`✓ ${el.descricao.slice(0, 30)} [COMPOSITA] → €${compositeValoreUnitario.toFixed(2)} × ${el.countRevit} = €${total.toFixed(2)}`, 'ok');
          } else {
            const missingCodes = [];
            if (!voce1) missingCodes.push(el.tariffa);
            if (!voce2) missingCodes.push(el.tariffa2);

            result = {
              idElemento:          el.idUnico,
              edificio:            el.edificio,
              livello:             el.livello,
              zona:                el.zona,
              categoria:           'Non trovato',
              descrizioneElemento: el.descricao,
              tipoPrezzo:          'misura',
              quantitaElemento:    el.countRevit,
              unidade:             el.unidade || '',
              valoreUnitario:      0,
              total:               0,
              originePrezzo:       'NAO_ENCONTRADO',
              status:              'NAO_ENCONTRADO',
              subItems: [],
              notes:               `Tariffe della composizione "${missingCodes.join(', ')}" non trovate nel prezzario.`,
              tipoImpianto:        el.tipoImpianto,
            };
            addLog(`✗ ${el.descricao.slice(0, 30)} [COMPOSITA] — CODICI "${missingCodes.join(', ')}" NON TROVATI`, 'err');
          }
        } else {
          // Flat single-item element
          if (voce1) {
            const factor = el.fatorWBS || 1;
            const singleValoreUnitario = voce1.valore * factor;
            const total = parseFloat((singleValoreUnitario * el.countRevit).toFixed(2));

            result = {
              idElemento:          el.idUnico,
              edificio:            el.edificio,
              livello:             el.livello,
              zona:                el.zona,
              categoria:           voce1.categoria || 'Generale',
              descrizioneElemento: el.descricao,
              tipoPrezzo:          'misura',
              quantitaElemento:    el.countRevit, // Revit Count
              unidade:             el.unidade || '', // Revit unit exclusively
              valoreUnitario:      singleValoreUnitario, // PU considering factor
              total,
              originePrezzo:       targetPrezzarioName,
              status:              'OK',
              subItems: [{
                codiceDeiOriginal:          el.tariffa,
                descrizioneDei:             el.descricao,
                codicePrezzarioTarget:      voce1.codice,
                descrizionePrezzarioTarget: voce1.descrizione,
                confiancaMatch:             1.0,
                quantitaComposizione:       factor, // composition factor
                valoreUnitario:             voce1.valore,
                status:                     'OK',
                unidade:                    voce1.um || 'cad',
              }],
              tipoImpianto:        el.tipoImpianto,
            };
            addLog(`✓ ${el.descricao.slice(0, 35)} [${el.tariffa}] → €${singleValoreUnitario.toFixed(2)} × ${el.countRevit} = €${total.toFixed(2)}`, 'ok');
          } else {
            result = {
              idElemento:          el.idUnico,
              edificio:            el.edificio,
              livello:             el.livello,
              zona:                el.zona,
              categoria:           'Non trovato',
              descrizioneElemento: el.descricao,
              tipoPrezzo:          'misura',
              quantitaElemento:    el.countRevit,
              unidade:             el.unidade || '',
              valoreUnitario:      0,
              total:               0,
              originePrezzo:       'NAO_ENCONTRADO',
              status:              'NAO_ENCONTRADO',
              subItems: [],
              notes:               `Tariffa "${el.tariffa}" non trovata nel prezzario.`,
              tipoImpianto:        el.tipoImpianto,
            };
            addLog(`✗ ${el.descricao.slice(0, 35)} [${el.tariffa}] — NON TROVATO`, 'err');
          }
        }

        processedResults.push(result);
        dispatch({ type: 'ADD_RESULTADO', payload: result });
      }

      // ── Handle NVP items — prompt user for manual price entry ─────────────
      if (nvpItems.length > 0) {
        addLog(`\n${nvpItems.length} voci NVP in attesa di inserimento manuale...`, 'alert');
        for (const el of nvpItems) {
          const { valoreUnitario, originePrezzo, nvpDetails } = await askNvp(el);
          const nvpResult = buildNvpResult(el, valoreUnitario, originePrezzo || 'NVP Manual');
          nvpResult.nvpDetails = nvpDetails; // save details for later editing
          processedResults.push(nvpResult);
          dispatch({ type: 'ADD_RESULTADO', payload: nvpResult });
          addLog(`✓ NVP: ${el.descricao.slice(0, 40)} → €${valoreUnitario}/cad`, 'ok');
        }
      }

      dispatch({ type: 'SET_PROCESSING', payload: false });
      addLog('\n✓ Elaborazione completata! Vai ai Risultati per esportare il file Excel.', 'ok');
      setTimeout(onDone, 1200);
    })().catch(e => addLog(`Errore fatale: ${String(e)}`, 'err'));
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const pct = state.progress.total > 0
    ? Math.round((state.progress.current / state.progress.total) * 100)
    : 0;

  return (
    <div className="flex-1 overflow-hidden p-8 flex flex-col gap-6">
      <div className="bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-600 dark:text-white/60 text-sm">{state.progress.message || 'Avvio in corso...'}</span>
          <span className="text-gray-900 dark:text-white font-black text-lg">{pct}%</span>
        </div>
        <div className="h-2 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-[#0F3460] to-[#E94560] rounded-full"
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400 dark:text-white/30 mt-2">
          <span>{state.progress.current} di {state.progress.total}</span>
          <span>Claude AI</span>
        </div>
      </div>

      <div ref={logRef} className="flex-1 bg-white dark:bg-[#080C14] border border-gray-200 dark:border-white/5 rounded-2xl p-5 overflow-auto font-mono text-xs leading-6">
        {log.map((entry, i) => (
          <div key={i} className={
            entry.type === 'ok' ? 'text-green-400' :
            entry.type === 'alert' ? 'text-yellow-400' :
            entry.type === 'err' ? 'text-red-400' : 'text-gray-500 dark:text-white/40'
          }>
            {entry.type === 'ok'    && <CheckCircle2 size={11} className="inline mr-1 mb-0.5" />}
            {entry.type === 'alert' && <AlertTriangle size={11} className="inline mr-1 mb-0.5" />}
            {entry.type === 'err'   && <XCircle size={11} className="inline mr-1 mb-0.5" />}
            {entry.type === 'info'  && <Loader2 size={11} className="inline mr-1 mb-0.5 animate-spin" />}
            {entry.text}
          </div>
        ))}
      </div>

      <AnimatePresence>
        {nvpModal && (
          <NvpBuilderModal 
            elemento={nvpModal.elemento}
            onConfirm={(valoreUnitario, originePrezzo, nvpDetails) => {
              nvpModal.resolve({ valoreUnitario, originePrezzo, nvpDetails });
              setNvpModal(null);
            }}
            onSkip={() => {
              nvpModal.resolve({ valoreUnitario: 0, originePrezzo: 'NVP — Non indicato', nvpDetails: null });
              setNvpModal(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
