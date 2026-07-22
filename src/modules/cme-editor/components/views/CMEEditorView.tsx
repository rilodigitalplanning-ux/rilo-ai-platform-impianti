import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Upload, FileSpreadsheet, Loader2, Download, X, CheckCircle2, ListChecks } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { parseElencoPrezzi } from '../../utils/parseElencoPrezzi';
import { exportElencoPrezzi } from '../../utils/exportElencoPrezzi';

function friendlyErrorMessage(e: any): string {
  return String(e?.message || e || 'Errore sconosciuto durante la lettura del file.');
}

export const CMEEditorView: React.FC = () => {
  const { moduleTheme, showToast, result, setResult } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelected = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const parsed = await parseElencoPrezzi(file);
      setResult(parsed);
      showToast(`${parsed.rows.length} voce/i pulita/e con successo!`, 'success');
    } catch (e: any) {
      const message = friendlyErrorMessage(e);
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleExport = async () => {
    if (!result) return;
    try {
      const baseName = result.fileName.replace(/\.(xls|xlsx)$/i, '');
      await exportElencoPrezzi(result.rows, `${baseName} - pulito.xlsx`);
      showToast('Excel esportato con successo!', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Errore durante l\'esportazione', 'error');
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col overflow-hidden"
    >
      <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <div className="max-w-6xl mx-auto space-y-8">

          {/* Azione principale */}
          <div className="flex items-center justify-end gap-3">
            {result && (
              <>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-[10px] font-bold border border-black/20 dark:border-white/20 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all dark:text-white"
                >
                  Nuovo file
                </button>
                <button
                  onClick={handleExport}
                  className="px-6 py-2.5 rounded-xl text-[10px] font-bold text-white flex items-center gap-2 active:scale-95 transition-all overflow-hidden group relative"
                  style={{ background: `linear-gradient(135deg, ${moduleTheme.primary}, ${moduleTheme.accent})` }}
                >
                  <Download size={14} className="relative z-10" />
                  <span className="relative z-10">Esporta Excel</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                </button>
              </>
            )}
          </div>

          {!result && (
            <div className="grid grid-cols-12 gap-8">
              {/* Upload */}
              <div className="col-span-5 space-y-6">
                <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-8 rounded-3xl premium-shadow space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${moduleTheme.accent}20` }}>
                      <FileSpreadsheet size={20} style={{ color: moduleTheme.accent }} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black dark:text-white uppercase tracking-tight">Elenco Prezzi Primus</h3>
                      <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest">Carica il file .xls / .xlsx</p>
                    </div>
                  </div>

                  <div
                    onClick={() => inputRef.current?.click()}
                    className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all border-black/20 dark:border-white/20 hover:border-black/40 dark:hover:border-white/40"
                  >
                    <input
                      ref={inputRef}
                      type="file"
                      accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="hidden"
                      onChange={e => handleFileSelected(e.target.files)}
                    />
                    {loading ? (
                      <>
                        <Loader2 size={28} className="mx-auto animate-spin mb-2" style={{ color: moduleTheme.accent }} />
                        <p className="text-[11px] font-bold dark:text-white opacity-60">Pulizia in corso...</p>
                      </>
                    ) : (
                      <>
                        <Upload size={28} className="mx-auto opacity-30 dark:text-white mb-2" />
                        <p className="text-[11px] font-bold dark:text-white opacity-60">Clic per selezionare il file</p>
                        <p className="text-[9px] opacity-30 dark:text-white/30 mt-1">Elenco Prezzi esportato da Primus (.xls / .xlsx)</p>
                      </>
                    )}
                  </div>

                  {error && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <p className="text-[10px] text-red-600 dark:text-red-400">{error}</p>
                    </div>
                  )}
                </section>
              </div>

              {/* Info / stato */}
              <div className="col-span-7 space-y-8">
                <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-8 rounded-3xl premium-shadow">
                  <h3 className="text-sm font-black dark:text-white uppercase tracking-tight mb-6">Cosa fa la pulizia</h3>
                  <ol className="space-y-4 text-[11px] dark:text-white/70">
                    <li className="flex gap-3">
                      <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: moduleTheme.accent }}>1</span>
                      Unisce ogni voce (riga codice + riga prezzo in lettere) in un'unica riga pulita.
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: moduleTheme.accent }}>2</span>
                      Rimuove le voci a quantità zero (non utilizzate nel computo).
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: moduleTheme.accent }}>3</span>
                      Svuota le colonne Prezzo e Importo, pronte per essere compilate.
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: moduleTheme.accent }}>4</span>
                      Formatta Prezzo e Importo come valuta (€) e imposta Importo = Prezzo × Quantità.
                    </li>
                  </ol>
                </section>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-8">
              {/* Stat cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 space-y-1">
                  <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">Voci originali</p>
                  <p className="text-2xl font-black" style={{ color: moduleTheme.accent }}>{result.originalCount}</p>
                </div>
                <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 space-y-1">
                  <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">Rimosse (quantità zero)</p>
                  <p className="text-2xl font-black" style={{ color: moduleTheme.accent }}>{result.removedZeroQty}</p>
                </div>
                <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 space-y-1">
                  <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">Voci nel file pulito</p>
                  <p className="text-2xl font-black" style={{ color: moduleTheme.accent }}>{result.rows.length}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700">
                <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                  Pulizia completata su "{result.fileName}". Verifica l'anteprima qui sotto ed esporta l'Excel.
                </p>
              </div>

              <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 rounded-3xl premium-shadow overflow-hidden">
                <div className="flex items-center gap-2 p-6 border-b border-black/5 dark:border-white/5">
                  <ListChecks size={16} style={{ color: moduleTheme.accent }} />
                  <h3 className="text-sm font-black dark:text-white uppercase tracking-tight">Anteprima Elenco Pulito</h3>
                </div>
                <div className="overflow-x-auto custom-scrollbar max-h-[520px]">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-[#F5F5F5] dark:bg-[#1a1a1a] border-b border-black/10 dark:border-white/10">
                        <th className="p-3 text-[9px] font-bold opacity-40 tracking-widest uppercase">Tariffa</th>
                        <th className="p-3 text-[9px] font-bold opacity-40 tracking-widest uppercase">Descrizione</th>
                        <th className="p-3 text-[9px] font-bold opacity-40 tracking-widest uppercase">Unità</th>
                        <th className="p-3 text-[9px] font-bold opacity-40 tracking-widest uppercase text-right">Prezzo</th>
                        <th className="p-3 text-[9px] font-bold opacity-40 tracking-widest uppercase text-right">Quantità</th>
                        <th className="p-3 text-[9px] font-bold opacity-40 tracking-widest uppercase text-right">Importo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((r, i) => (
                        <tr key={i} className="border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                          <td className="p-3 text-[10px] font-bold dark:text-white" style={{ color: moduleTheme.accent }}>{r.tariffa}</td>
                          <td className="p-3 text-[10px] dark:text-white/80 max-w-[420px] truncate" title={r.descrizione}>{r.descrizione}</td>
                          <td className="p-3 text-[10px] dark:text-white/80">{r.unita || '—'}</td>
                          <td className="p-3 text-[10px] dark:text-white/40 text-right italic">da compilare</td>
                          <td className="p-3 text-[10px] dark:text-white/80 text-right">{r.quantita.toLocaleString('it-IT')}</td>
                          <td className="p-3 text-[10px] dark:text-white/40 text-right italic">€ 0,00</td>
                        </tr>
                      ))}
                      {result.rows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-[10px] opacity-30 dark:text-white uppercase tracking-widest">
                            Nessuna voce valida trovata nel file
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
