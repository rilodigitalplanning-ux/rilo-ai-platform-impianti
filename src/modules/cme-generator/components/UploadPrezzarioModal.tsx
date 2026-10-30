import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, Upload, FileSpreadsheet, FileText, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { parsePrezzarioUpload, ACCEPTED_PREZZARIO_FILES, type PrezzarioParseOutput } from '../services/prezzarioImport';
import { savePrezzario } from '../services/prezzarioService';
import { getCurrentUser } from '../lib/currentUser';

interface Props {
  existingNames: string[];
  onClose: () => void;
  onSaved: (nome: string, totalVoci: number) => void;
}

const fmtEuro = (v: number) => v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export const UploadPrezzarioModal: React.FC<Props> = ({ existingNames, onClose, onSaved }) => {
  const { moduleTheme } = useApp();
  const [nome, setNome] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState<{ done: number; total: number } | null>(null);
  const [parsed, setParsed] = useState<PrezzarioParseOutput | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const trimmed = nome.trim();
  const duplicate = trimmed !== '' && existingNames.some(n => n.trim().toLowerCase() === trimmed.toLowerCase());
  const busy = parsing || saving;
  const canSave = !!parsed && parsed.voci.length > 0 && trimmed !== '' && !duplicate && !busy;

  async function handleFile(f: File) {
    setFile(f);
    setParsed(null);
    setError(null);
    setParseProgress(null);
    if (!nome.trim()) setNome(f.name.replace(/\.[^.]+$/, ''));
    setParsing(true);
    try {
      const out = await parsePrezzarioUpload(f, (done, total) => setParseProgress({ done, total }));
      if (out.voci.length === 0) {
        setError(
          out.source === 'pdf'
            ? 'Non è stata riconosciuta nessuna voce nel PDF. Il formato atteso è: CODICE  descrizione  UM  prezzo (una voce per riga). Prova con un file Excel.'
            : 'Non è stata riconosciuta nessuna voce nel file. Verifica che ci siano le colonne codice/tariffa, descrizione, UM e prezzo.',
        );
      }
      setParsed(out);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (!parsed || !canSave) return;
    setSaving(true);
    setError(null);
    setSaveProgress({ done: 0, total: parsed.voci.length });
    try {
      await savePrezzario(trimmed, parsed.voci, getCurrentUser().id, (done, total) => setSaveProgress({ done, total }));
      onSaved(trimmed, parsed.voci.length);
    } catch (e: any) {
      setError(e?.message || String(e));
      setSaving(false);
    }
  }

  const pct = (p: { done: number; total: number } | null) => (p && p.total ? Math.round((p.done / p.total) * 100) : 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        onClick={() => { if (!busy) onClose(); }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#141414] rounded-3xl shadow-2xl border border-black/10 dark:border-white/10"
      >
        <div className="flex items-center justify-between px-8 py-5 border-b border-black/10 dark:border-white/10">
          <h2 className="text-sm font-black uppercase tracking-tight dark:text-white">Carica nuovo prezzario</h2>
          <button onClick={onClose} disabled={busy} className="p-2 opacity-40 hover:opacity-100 rounded-full hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-20 dark:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-8 space-y-6 dark:text-white">
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest opacity-40">Nome del prezzario</label>
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              disabled={saving}
              placeholder="Es. DEI 2024, Prezzario Regione Sicilia 2022…"
              className="mt-1.5 w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2"
              style={{ ['--tw-ring-color' as any]: moduleTheme.accent }}
            />
            {duplicate && (
              <p className="text-[10px] font-bold text-red-500 mt-1.5">Esiste già un prezzario con questo nome: scegli un nome diverso.</p>
            )}
          </div>

          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest opacity-40">File (Excel, CSV o PDF)</label>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_PREZZARIO_FILES}
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
            <div
              onClick={() => { if (!busy) fileRef.current?.click(); }}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f && !busy) handleFile(f); }}
              className={`mt-1.5 border-2 border-dashed rounded-2xl p-6 flex items-center gap-4 cursor-pointer transition-colors ${
                dragOver ? 'bg-black/5 dark:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/5'
              } border-black/15 dark:border-white/15`}
            >
              {file?.name.toLowerCase().endsWith('.pdf') ? <FileText size={28} className="opacity-50" /> : <FileSpreadsheet size={28} className="opacity-50" />}
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{file ? file.name : 'Trascina qui il file o clicca per selezionarlo'}</p>
                <p className="text-[10px] opacity-40 mt-0.5">
                  {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : '.xlsx · .xls · .csv · .pdf'}
                </p>
              </div>
              <Upload size={18} className="ml-auto opacity-40 shrink-0" />
            </div>
          </div>

          {parsing && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold opacity-60 flex items-center gap-2">
                <Loader2 size={13} className="animate-spin" />
                {parseProgress ? `Lettura del PDF: pagina ${parseProgress.done} di ${parseProgress.total}…` : 'Lettura del file…'}
              </p>
              {parseProgress && (
                <div className="h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                  <div className="h-full transition-all" style={{ width: `${pct(parseProgress)}%`, backgroundColor: moduleTheme.accent }} />
                </div>
              )}
            </div>
          )}

          {parsed && parsed.voci.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[12px] font-bold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={15} />
                {parsed.voci.length.toLocaleString('it-IT')} voci riconosciute
                {parsed.pages ? ` in ${parsed.pages} pagine` : ''}
                {parsed.skipped > 0 && <span className="opacity-60 font-normal text-gray-500 dark:text-white/50"> · {parsed.skipped.toLocaleString('it-IT')} righe senza prezzo scartate</span>}
              </div>
              {parsed.source === 'pdf' && (
                <div className="flex gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>L'estrazione da PDF è euristica: controlla l'anteprima (codici, unità di misura e prezzi) prima di salvare. Con un file Excel il risultato è più affidabile.</span>
                </div>
              )}
              <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
                <table className="w-full text-[11px]">
                  <thead className="bg-black/5 dark:bg-white/5 text-left">
                    <tr>
                      <th className="px-3 py-2 font-bold">Codice</th>
                      <th className="px-3 py-2 font-bold">Descrizione</th>
                      <th className="px-3 py-2 font-bold">UM</th>
                      <th className="px-3 py-2 font-bold text-right">Prezzo €</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.voci.slice(0, 8).map((v, i) => (
                      <tr key={i} className="border-t border-black/5 dark:border-white/5">
                        <td className="px-3 py-1.5 font-mono whitespace-nowrap">{v.codice}</td>
                        <td className="px-3 py-1.5 max-w-[260px] truncate" title={v.descrizione}>{v.descrizione}</td>
                        <td className="px-3 py-1.5">{v.um}</td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">{fmtEuro(v.valore)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] opacity-40">Anteprima delle prime 8 voci.</p>
            </div>
          )}

          {saving && saveProgress && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold opacity-60 flex items-center gap-2">
                <Loader2 size={13} className="animate-spin" />
                Salvataggio nel database: {saveProgress.done.toLocaleString('it-IT')} / {saveProgress.total.toLocaleString('it-IT')} voci…
              </p>
              <div className="h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                <div className="h-full transition-all" style={{ width: `${pct(saveProgress)}%`, backgroundColor: moduleTheme.accent }} />
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-500">{error}</div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-8 py-5 border-t border-black/10 dark:border-white/10">
          <p className="text-[10px] opacity-40 dark:text-white">Il prezzario sarà visibile a tutti gli utenti.</p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 dark:text-white"
            >
              Annulla
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="px-5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white disabled:opacity-30 transition-opacity"
              style={{ backgroundColor: moduleTheme.accent }}
            >
              Salva nel database
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
