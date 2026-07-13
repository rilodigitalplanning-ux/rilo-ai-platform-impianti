import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Upload, FileText, X, Loader2, Sparkles, Download, Table2, Trash2, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { parseQuadroFiles } from '../../utils/parseQuadro';
import { exportSchemaToExcel } from '../../utils/exportExcel';
import type { UploadedFile } from '../../types';

function fmt(n: number | null, decimals = 2): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

// Oltre ~32MB (base64 incluso) l'API rifiuta la richiesta a livello di rete,
// mostrando solo un generico "Connection error" — blocchiamo prima di arrivarci.
const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

function friendlyErrorMessage(e: any): string {
  const raw = String(e?.message || e || '');
  if (/connection error/i.test(raw)) {
    return 'Errore di connessione con il servizio IA. Verifica la connessione internet; se il file è molto pesante, prova a ridurne le dimensioni.';
  }
  return raw || 'Errore sconosciuto';
}

export const PanelScheduleView: React.FC = () => {
  const { moduleTheme, showToast, parsedSchema, setParsedSchema, activeTab, setActiveTab } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(false);

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList) return;
    const newFiles: UploadedFile[] = Array.from(fileList).map(file => {
      const oversized = file.size > MAX_FILE_SIZE_BYTES;
      return {
        id: crypto.randomUUID(),
        file,
        status: oversized ? 'error' : 'pending',
        error: oversized
          ? `File troppo grande (${(file.size / (1024 * 1024)).toFixed(1)} MB, limite ${MAX_FILE_SIZE_MB} MB) — riduci la risoluzione del PDF o dividilo in più file`
          : undefined,
      };
    });
    setUploads(prev => [...prev, ...newFiles]);
    if (newFiles.some(f => f.status === 'error')) {
      showToast(`Uno o più file superano il limite di ${MAX_FILE_SIZE_MB} MB`, 'error');
    }
  };

  const removeUpload = (id: string) => {
    setUploads(prev => prev.filter(u => u.id !== id));
  };

  const handleAnalyse = async () => {
    const validUploads = uploads.filter(u => u.status !== 'error');
    if (validUploads.length === 0) return;
    setLoading(true);
    setUploads(prev => prev.map(u => u.status === 'error' ? u : { ...u, status: 'processing' }));
    try {
      const schema = await parseQuadroFiles(validUploads.map(u => u.file));
      setParsedSchema(schema);
      setUploads(prev => prev.map(u => u.status === 'error' ? u : { ...u, status: 'done' }));
      showToast(`${schema.quadri.length} quadro/i letto/i con successo!`, 'success');
      setActiveTab('risultati');
    } catch (e: any) {
      const message = friendlyErrorMessage(e);
      setUploads(prev => prev.map(u => u.status === 'error' ? u : { ...u, status: 'error', error: message }));
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!parsedSchema) return;
    try {
      await exportSchemaToExcel(parsedSchema);
      showToast('Excel esportato con successo!', 'success');
    } catch (e: any) {
      showToast(e.message || 'Errore durante l\'esportazione', 'error');
    }
  };

  const totalRighe = parsedSchema?.quadri.reduce((acc, q) => acc + q.righe.length, 0) ?? 0;

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
          <div className="flex items-center justify-end">
            {parsedSchema && (
              <button
                onClick={handleExport}
                className="px-6 py-2.5 rounded-xl text-[10px] font-bold text-white flex items-center gap-2 active:scale-95 transition-all overflow-hidden group relative"
                style={{ background: `linear-gradient(135deg, ${moduleTheme.primary}, ${moduleTheme.accent})` }}
              >
                <Download size={14} className="relative z-10" />
                <span className="relative z-10">Esporta Excel</span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              </button>
            )}
          </div>

          {/* Sub-nav interna */}
          <div className="flex gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-xl w-fit">
            {(['lettura', 'risultati'] as const).map(s => (
              <button
                key={s}
                onClick={() => setActiveTab(s)}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                  activeTab === s
                    ? 'bg-white dark:bg-[#141414] shadow-sm dark:text-white'
                    : 'text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white'
                }`}
              >
                {s === 'lettura' ? 'Lettura Schemi' : 'Tabella Risultati'}
              </button>
            ))}
          </div>

          {activeTab === 'lettura' && (
            <div className="grid grid-cols-12 gap-8">
              {/* Upload */}
              <div className="col-span-5 space-y-6">
                <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-8 rounded-3xl premium-shadow space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${moduleTheme.accent}20` }}>
                      <FileText size={20} style={{ color: moduleTheme.accent }} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black dark:text-white uppercase tracking-tight">Schemi Unifilari</h3>
                      <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest">Carica uno o più PDF</p>
                    </div>
                  </div>

                  <div
                    onClick={() => inputRef.current?.click()}
                    className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all border-black/20 dark:border-white/20 hover:border-black/40 dark:hover:border-white/40"
                    style={{ borderColor: uploads.length > 0 ? `${moduleTheme.accent}80` : undefined }}
                  >
                    <input
                      ref={inputRef}
                      type="file"
                      accept="application/pdf,image/png,image/jpeg,image/webp"
                      multiple
                      className="hidden"
                      onChange={e => handleFilesSelected(e.target.files)}
                    />
                    <Upload size={28} className="mx-auto opacity-30 dark:text-white mb-2" />
                    <p className="text-[11px] font-bold dark:text-white opacity-60">Clic per selezionare i file</p>
                    <p className="text-[9px] opacity-30 dark:text-white/30 mt-1">PDF, PNG, JPG o WEBP — più file supportati, max {MAX_FILE_SIZE_MB} MB ciascuno</p>
                  </div>

                  {uploads.length > 0 && (
                    <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                      {uploads.map(u => (
                        <div key={u.id} className="flex items-center gap-2 p-2 rounded-lg bg-black/5 dark:bg-white/5 text-[10px]">
                          <FileText size={14} className="opacity-40 shrink-0" style={{ color: moduleTheme.accent }} />
                          <span className="flex-1 truncate font-bold dark:text-white">{u.file.name}</span>
                          {u.status === 'processing' && <Loader2 size={12} className="animate-spin opacity-50" />}
                          {u.status === 'done' && <span className="text-emerald-500 text-[9px] font-bold">OK</span>}
                          {u.status === 'error' && <span className="text-red-500 text-[9px] font-bold" title={u.error}>ERRORE</span>}
                          <button onClick={() => removeUpload(u.id)} className="p-1 text-black/20 hover:text-red-500 transition-colors shrink-0">
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={handleAnalyse}
                    disabled={uploads.every(u => u.status === 'error') || uploads.length === 0 || loading}
                    className="w-full py-3 text-[11px] font-bold text-white rounded-xl transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                    style={{ backgroundColor: moduleTheme.accent }}
                  >
                    {loading
                      ? <><Loader2 size={14} className="animate-spin" /> Analisi in corso...</>
                      : <><Sparkles size={14} /> Analizza con IA</>
                    }
                  </button>
                </section>
              </div>

              {/* Info / stato */}
              <div className="col-span-7 space-y-8">
                <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-8 rounded-3xl premium-shadow">
                  <h3 className="text-sm font-black dark:text-white uppercase tracking-tight mb-6">Come funziona</h3>
                  <ol className="space-y-4 text-[11px] dark:text-white/70">
                    <li className="flex gap-3">
                      <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: moduleTheme.accent }}>1</span>
                      Carica uno o più schemi unifilari (PDF nativo o scansionato).
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: moduleTheme.accent }}>2</span>
                      L'IA (Claude Opus) legge ogni partenza/circuito ed estrae potenza, cavo, lunghezza, tensione e caduta di tensione, verificando sia la portata (Ib≤In≤Iz) sia il limite normativo di caduta di tensione (≤4%).
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: moduleTheme.accent }}>3</span>
                      I circuiti vengono raggruppati automaticamente per quadro/corpo.
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: moduleTheme.accent }}>4</span>
                      Verifica la tabella nella scheda "Tabella Risultati" ed esporta in Excel.
                    </li>
                  </ol>
                </section>
              </div>
            </div>
          )}

          {activeTab === 'risultati' && (
            <div className="space-y-8">
              {!parsedSchema && (
                <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-8 rounded-3xl premium-shadow">
                  <div className="h-64 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-black/10 dark:border-white/10 rounded-2xl">
                    <Table2 size={32} className="opacity-20 dark:text-white" />
                    <p className="text-[10px] font-bold opacity-30 dark:text-white uppercase tracking-widest">
                      Nessun dato — carica e analizza uno schema nella scheda "Lettura Schemi"
                    </p>
                  </div>
                </section>
              )}

              {parsedSchema && (
                <>
                  {/* Stat cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 space-y-1">
                      <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">Quadri</p>
                      <p className="text-2xl font-black" style={{ color: moduleTheme.accent }}>{parsedSchema.quadri.length}</p>
                    </div>
                    <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 space-y-1">
                      <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">Circuiti totali</p>
                      <p className="text-2xl font-black" style={{ color: moduleTheme.accent }}>{totalRighe}</p>
                    </div>
                    <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 space-y-1">
                      <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">Potenza totale</p>
                      <p className="text-2xl font-black" style={{ color: moduleTheme.accent }}>
                        {fmt(parsedSchema.quadri.reduce((acc, q) => acc + q.righe.reduce((a, r) => a + (r.potenzaKw || 0), 0), 0), 1)}
                        <span className="text-sm font-bold opacity-40 ml-1">kW</span>
                      </p>
                    </div>
                  </div>

                  {parsedSchema.quadri.some(q => q.righe.some(r => r.warning)) && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                      <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                      <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400">
                        Le righe evidenziate hanno un valore di Ib non coerente con la potenza installata — verifica manualmente sul disegno originale prima di esportare.
                      </p>
                    </div>
                  )}

                  {/* Tabelle per quadro, in ordine di cascata (MT/QGBT → secondari → terziari...) */}
                  {parsedSchema.quadri.map((quadro, qi) => (
                    <section
                      key={qi}
                      className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 rounded-3xl premium-shadow overflow-hidden"
                      style={{ marginLeft: quadro.livello * 24 }}
                    >
                      <div className="flex items-center justify-between p-6 border-b border-black/5 dark:border-white/5">
                        <div className="flex items-center gap-2">
                          {quadro.livello > 0 && (
                            <span className="text-black/20 dark:text-white/20 text-sm">↳</span>
                          )}
                          <div>
                            <h3 className="text-sm font-black dark:text-white uppercase tracking-tight">{quadro.nome}</h3>
                            {quadro.alimentatoDa ? (
                              <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest mt-0.5">
                                Alimentato da {quadro.alimentatoDa}
                              </p>
                            ) : (
                              <p className="text-[9px] font-bold uppercase tracking-widest mt-0.5" style={{ color: moduleTheme.accent }}>
                                Radice cascata (MT / QGBT)
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const next = { quadri: parsedSchema.quadri.filter((_, i) => i !== qi) };
                            setParsedSchema(next.quadri.length > 0 ? next : null);
                          }}
                          className="p-1.5 text-black/20 hover:text-red-500 transition-colors"
                          title="Rimuovi quadro"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse min-w-[1080px]">
                          <thead>
                            <tr className="bg-[#F5F5F5] dark:bg-white/5 border-b border-black/10 dark:border-white/10">
                              <th className="p-3 text-[9px] font-bold opacity-40 tracking-widest uppercase">Descrizione</th>
                              <th className="p-3 text-[9px] font-bold opacity-40 tracking-widest uppercase">Sistema</th>
                              <th className="p-3 text-[9px] font-bold opacity-40 tracking-widest uppercase">Fasi</th>
                              <th className="p-3 text-[9px] font-bold opacity-40 tracking-widest uppercase">P [kW]</th>
                              <th className="p-3 text-[9px] font-bold opacity-40 tracking-widest uppercase">Cavo</th>
                              <th className="p-3 text-[9px] font-bold opacity-40 tracking-widest uppercase">Lungh. [m]</th>
                              <th className="p-3 text-[9px] font-bold opacity-40 tracking-widest uppercase">Un [V]</th>
                              <th className="p-3 text-[9px] font-bold opacity-40 tracking-widest uppercase">ΔV [%]</th>
                              <th className="p-3 text-[9px] font-bold opacity-40 tracking-widest uppercase">Verifica Ib≤In≤Iz</th>
                              <th className="p-3 text-[9px] font-bold opacity-40 tracking-widest uppercase">Verifica ΔV ≤4%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {quadro.righe.map((r, ri) => (
                              <tr key={ri} className={`border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${r.warning ? 'bg-amber-50 dark:bg-amber-900/10' : ''}`}>
                                <td className="p-3 text-[10px] font-bold dark:text-white">
                                  <div className="flex items-center gap-1.5">
                                    {r.warning && (
                                      <span title={r.warning}>
                                        <AlertTriangle size={12} className="text-amber-500 shrink-0" />
                                      </span>
                                    )}
                                    {r.tag && <span style={{ color: moduleTheme.accent }}>{r.tag}</span>}
                                    {r.tag && r.descrizione ? ' | ' : ''}
                                    {r.descrizione}
                                  </div>
                                </td>
                                <td className="p-3 text-[10px] dark:text-white/80">{r.sistema || '—'}</td>
                                <td className="p-3 text-[10px] dark:text-white/80">{r.fasi || '—'}</td>
                                <td className="p-3 text-[10px] dark:text-white/80">{fmt(r.potenzaKw)}</td>
                                <td className="p-3 text-[10px] dark:text-white/80">{r.cavo || '—'}</td>
                                <td className="p-3 text-[10px] dark:text-white/80">{fmt(r.lunghezzaM, 1)}</td>
                                <td className="p-3 text-[10px] dark:text-white/80">{fmt(r.tensioneV, 0)}</td>
                                <td className="p-3 text-[10px] dark:text-white/80">{fmt(r.caduteTensionePct)}</td>
                                <td className="p-3 text-[9px] font-bold dark:text-white/60">
                                  {(() => {
                                    const protezione = r.ir ?? r.in;
                                    return r.ib !== null || protezione !== null || r.iz !== null
                                      ? `${fmt(r.ib)}<=${fmt(protezione, 0)}<=${fmt(r.iz, 0)} A`
                                      : '—';
                                  })()}
                                </td>
                                <td className="p-3 text-[9px] font-bold">
                                  {r.caduteTensionePct === null ? (
                                    <span className="dark:text-white/60">—</span>
                                  ) : Math.abs(r.caduteTensionePct) <= 4 ? (
                                    <span className="text-emerald-600 dark:text-emerald-400">{fmt(r.caduteTensionePct)}{'<='}4% (Verificato)</span>
                                  ) : (
                                    <span className="text-red-600 dark:text-red-400">{fmt(r.caduteTensionePct)}{'<='}4% (NON verificato)</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                            {quadro.righe.length === 0 && (
                              <tr>
                                <td colSpan={10} className="p-6 text-center text-[10px] opacity-30 dark:text-white uppercase tracking-widest">
                                  Nessun circuito estratto per questo quadro
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
