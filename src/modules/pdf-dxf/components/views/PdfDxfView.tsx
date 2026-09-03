import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Upload, FileCode2, Loader2, Download, CheckCircle2, AlertTriangle, Layers, Scan } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { convertPdfToDxf } from '../../utils/pdfToDxf';
import { saveFileWithPicker } from '@/utils/fileSave';

function friendlyErrorMessage(e: any): string {
  return String(e?.message || e || 'Errore sconosciuto durante la conversione.');
}

export const PdfDxfView: React.FC = () => {
  const { moduleTheme, showToast, result, setResult } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [planScale, setPlanScale] = useState(1);
  const [minSizeMm, setMinSizeMm] = useState(0);

  const handleFileSelected = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    setProgress('Avvio conversione...');
    try {
      const converted = await convertPdfToDxf(file, setProgress, { planScale, minSizeMm });
      setResult(converted);
      showToast(`${converted.stats.entities} entità estratte con successo!`, 'success');
    } catch (e: any) {
      const message = friendlyErrorMessage(e);
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
      setProgress('');
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleExport = async () => {
    if (!result) return;
    try {
      const baseName = result.stats.fileName.replace(/\.pdf$/i, '');
      const blob = new Blob([result.dxfText], { type: 'application/dxf' });
      await saveFileWithPicker(blob, {
        suggestedName: `${baseName}.dxf`,
        mimeType: 'application/dxf',
        extensions: ['.dxf'],
        description: 'Disegno DXF',
      });
      showToast('DXF esportato con successo!', 'success');
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
                  <span className="relative z-10">Esporta DXF</span>
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
                      <FileCode2 size={20} style={{ color: moduleTheme.accent }} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black dark:text-white uppercase tracking-tight">Disegno PDF</h3>
                      <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest">Carica il file .pdf</p>
                    </div>
                  </div>

                  <div
                    onClick={() => !loading && inputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-all border-black/20 dark:border-white/20 ${loading ? 'cursor-wait' : 'cursor-pointer hover:border-black/40 dark:hover:border-white/40'}`}
                  >
                    <input
                      ref={inputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={e => handleFileSelected(e.target.files)}
                    />
                    {loading ? (
                      <>
                        <Loader2 size={28} className="mx-auto animate-spin mb-2" style={{ color: moduleTheme.accent }} />
                        <p className="text-[11px] font-bold dark:text-white opacity-60">{progress || 'Conversione in corso...'}</p>
                      </>
                    ) : (
                      <>
                        <Upload size={28} className="mx-auto opacity-30 dark:text-white mb-2" />
                        <p className="text-[11px] font-bold dark:text-white opacity-60">Clic per selezionare il file</p>
                        <p className="text-[9px] opacity-30 dark:text-white/30 mt-1">Disegno PDF vettoriale o scansionato</p>
                      </>
                    )}
                  </div>

                  {error && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <p className="text-[10px] text-red-600 dark:text-red-400">{error}</p>
                    </div>
                  )}
                </section>

                <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-8 rounded-3xl premium-shadow space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${moduleTheme.accent}20` }}>
                      <Scan size={20} style={{ color: moduleTheme.accent }} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black dark:text-white uppercase tracking-tight">Opzioni PDF scansionato</h3>
                      <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest">Usate solo se il PDF non ha vettori</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">
                      Scala della planimetria (es. 100 per "1:100")
                    </label>
                    <input
                      type="number"
                      min={1}
                      step="any"
                      value={planScale}
                      onChange={e => setPlanScale(Math.max(0.001, parseFloat(e.target.value) || 1))}
                      className="w-full bg-[#efefef] dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl px-4 py-2 text-[11px] font-bold dark:text-white outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">
                      Filtro dimensione minima (mm) — opzionale
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={minSizeMm}
                      onChange={e => setMinSizeMm(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full bg-[#efefef] dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl px-4 py-2 text-[11px] font-bold dark:text-white outline-none"
                    />
                    <p className="text-[9px] opacity-40 dark:text-white/40">
                      0 = trace completo (più fedele, poi ripulisci simboli/testo indesiderati nel CAD). Un valore &gt; 0 scarta i tracciati più piccoli (utile per rimuovere simboli/testo automaticamente, ma può tagliare dettagli validi).
                    </p>
                  </div>
                </section>
              </div>

              {/* Info */}
              <div className="col-span-7 space-y-8">
                <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-8 rounded-3xl premium-shadow">
                  <h3 className="text-sm font-black dark:text-white uppercase tracking-tight mb-6">Come funziona la conversione</h3>
                  <ol className="space-y-4 text-[11px] dark:text-white/70">
                    <li className="flex gap-3">
                      <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: moduleTheme.accent }}>1</span>
                      Prova prima a leggere i tracciati vettoriali (linee, curve, rettangoli) direttamente dal contenuto del PDF — il metodo più fedele, per PDF esportati da un CAD.
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: moduleTheme.accent }}>2</span>
                      Se una pagina non ha vettori (PDF scansionato/plottato come immagine), la renderizza ad alta risoluzione (300 DPI) e la vettorizza con <strong>Potrace</strong> — lo stesso motore di vettorizzazione bitmap→vettore usato professionalmente, non un tracciamento improvvisato.
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: moduleTheme.accent }}>3</span>
                      Calibra la scala reale in mm usando la scala impostata qui sopra, converte ogni tracciato in entità LINE e organizza più pagine in layer separati.
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: moduleTheme.accent }}>4</span>
                      Esporta un file .dxf in millimetri, pronto per l'importazione in AutoCAD o altro software CAD.
                    </li>
                  </ol>
                  <div className="mt-6 p-3 rounded-lg bg-black/5 dark:bg-white/5">
                    <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40 mb-1">Limite importante (fallback raster)</p>
                    <p className="text-[10px] dark:text-white/60">
                      Su un PDF scansionato, Potrace traccia <strong>tutto</strong> ciò che è scuro nell'immagine — pareti, porte, simboli, testo (come contorno) — senza distinguerli tra loro: non c'è modo di saperlo a partire dai soli pixel, essendo tutto sullo stesso layer.
                      Il "trace completo" (filtro a 0) è il più fedele: ripulisci manualmente simboli/testo indesiderati nel CAD dopo l'importazione. Il filtro dimensione minima automatizza questa pulizia, ma è un'euristica — rischia di scartare dettagli piccoli ma validi (es. archi porta).
                      Verifica sempre la scala: la dimensione finale del disegno (mostrata dopo la conversione) deve essere plausibile per un edificio reale.
                    </p>
                  </div>
                </section>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-8">
              {/* Stat cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 space-y-1">
                  <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">Pagine lette</p>
                  <p className="text-2xl font-black" style={{ color: moduleTheme.accent }}>{result.stats.pages}</p>
                </div>
                <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 space-y-1">
                  <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">Entità DXF generate</p>
                  <p className="text-2xl font-black" style={{ color: moduleTheme.accent }}>{result.stats.entities}</p>
                </div>
                <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 space-y-1">
                  <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">Layer</p>
                  <p className="text-2xl font-black" style={{ color: moduleTheme.accent }}>{result.stats.layers}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700">
                <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                  Conversione completata su "{result.stats.fileName}". Esporta il DXF per aprirlo nel tuo software CAD.
                </p>
                <span className="ml-auto shrink-0 px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                  {result.stats.vectorPages > 0 && result.stats.rasterPages > 0
                    ? `${result.stats.vectorPages} vettoriale + ${result.stats.rasterPages} raster`
                    : result.stats.rasterPages > 0
                      ? `${result.stats.rasterPages} pag. raster (Potrace)`
                      : `${result.stats.vectorPages} pag. vettoriale`}
                </span>
              </div>

              {result.stats.warnings.length > 0 && (
                <section className="bg-white dark:bg-[#141414] border border-amber-200 dark:border-amber-800 rounded-2xl p-6 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} className="text-amber-500" />
                    <h3 className="text-[11px] font-black dark:text-white uppercase tracking-tight">Avvisi</h3>
                  </div>
                  <ul className="space-y-1.5">
                    {result.stats.warnings.map((w, i) => (
                      <li key={i} className="text-[10px] text-amber-700 dark:text-amber-400">{w}</li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-8 rounded-3xl premium-shadow">
                <div className="flex items-center gap-2 mb-4">
                  <Layers size={16} style={{ color: moduleTheme.accent }} />
                  <h3 className="text-sm font-black dark:text-white uppercase tracking-tight">Pronto per l'esportazione</h3>
                </div>
                <p className="text-[11px] dark:text-white/60">
                  Il file DXF è stato generato in memoria. Clic su "Esporta DXF" in alto per scegliere dove salvarlo — la finestra
                  di salvataggio si aprirà automaticamente nell'ultima cartella usata.
                </p>
              </section>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
