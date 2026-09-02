import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Upload, FileCode2, Loader2, Download, CheckCircle2, AlertTriangle, Layers } from 'lucide-react';
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

  const handleFileSelected = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    setProgress('Avvio conversione...');
    try {
      const converted = await convertPdfToDxf(file, setProgress);
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
                        <p className="text-[9px] opacity-30 dark:text-white/30 mt-1">Disegno PDF con tracciati vettoriali (es. esportato da un CAD)</p>
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

              {/* Info */}
              <div className="col-span-7 space-y-8">
                <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-8 rounded-3xl premium-shadow">
                  <h3 className="text-sm font-black dark:text-white uppercase tracking-tight mb-6">Come funziona la conversione</h3>
                  <ol className="space-y-4 text-[11px] dark:text-white/70">
                    <li className="flex gap-3">
                      <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: moduleTheme.accent }}>1</span>
                      Legge i tracciati vettoriali (linee, curve, rettangoli) direttamente dal contenuto del PDF — non è una scansione/OCR.
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: moduleTheme.accent }}>2</span>
                      Converte ogni tracciato in entità LINE (le curve vengono approssimate con piccoli segmenti).
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: moduleTheme.accent }}>3</span>
                      Mantiene i colori dei tracciati (mappati sui colori standard AutoCAD) e organizza più pagine in layer separati.
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: moduleTheme.accent }}>4</span>
                      Esporta un file .dxf in millimetri, pronto per l'importazione in AutoCAD o altro software CAD.
                    </li>
                  </ol>
                  <div className="mt-6 p-3 rounded-lg bg-black/5 dark:bg-white/5">
                    <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40 mb-1">Limite importante</p>
                    <p className="text-[10px] dark:text-white/60">
                      Funziona solo con PDF che contengono <strong>tracciati vettoriali</strong> (es. esportati da AutoCAD, Revit o simili).
                      Un PDF <strong>scansionato</strong> (immagine/foto di un disegno) non contiene geometria da estrarre e non produrrà risultati utili.
                      Il testo del disegno (quote, etichette) non viene convertito — solo la geometria delle linee.
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
