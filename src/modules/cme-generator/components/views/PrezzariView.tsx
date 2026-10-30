import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2, Library, Loader2, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { listPrezzarios, deletePrezzario } from '../../services/prezzarioService';
import { UploadPrezzarioModal } from '../UploadPrezzarioModal';
import type { PrezzarioRecord } from '../../types';

export const PrezzariView: React.FC = () => {
  const { moduleTheme, showToast, prezzariVersion, bumpPrezzari } = useApp();
  const [prezzari, setPrezzari] = useState<PrezzarioRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setPrezzari(await listPrezzarios());
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [prezzariVersion]);

  async function handleDelete(p: PrezzarioRecord) {
    if (!window.confirm(`Eliminare il prezzario "${p.nome}" e tutte le sue ${p.totalVoci.toLocaleString('it-IT')} voci?`)) return;
    setDeletingId(p.id!);
    try {
      await deletePrezzario(p.id!);
      showToast(`Prezzario "${p.nome}" eliminato.`, 'success');
      bumpPrezzari();
    } catch (e: any) {
      showToast(e?.message || String(e), 'error');
    } finally {
      setDeletingId(null);
    }
  }

  const totalVoci = prezzari.reduce((s, p) => s + p.totalVoci, 0);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50 dark:bg-[#060A12] text-gray-900 dark:text-white">
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
        className="max-w-4xl mx-auto p-8 space-y-6"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight">Prezzari</h2>
            <p className="text-[11px] opacity-50 mt-1">
              {loading
                ? 'Caricamento…'
                : `${prezzari.length} prezzari nel database · ${totalVoci.toLocaleString('it-IT')} voci · condivisi con tutti gli utenti`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="p-2.5 rounded-xl border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40"
              title="Aggiorna"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest text-white hover:opacity-90 transition-opacity"
              style={{ backgroundColor: moduleTheme.accent }}
            >
              <Plus size={14} /> Carica nuovo prezzario
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-500">{error}</div>
        )}

        {loading && prezzari.length === 0 && (
          <div className="flex justify-center py-16 opacity-40"><Loader2 className="animate-spin" /></div>
        )}

        {!loading && !error && prezzari.length === 0 && (
          <div className="text-center py-20 border-2 border-dashed border-black/10 dark:border-white/10 rounded-3xl">
            <Library size={32} className="mx-auto opacity-20 mb-3" />
            <p className="text-sm font-bold">Nessun prezzario caricato</p>
            <p className="text-[11px] opacity-40 mt-1">Carica un file Excel o PDF per iniziare.</p>
          </div>
        )}

        <div className="space-y-2">
          {prezzari.map(p => (
            <div
              key={p.id}
              className="flex items-center gap-4 bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 rounded-2xl px-5 py-4"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${moduleTheme.accent}1a`, color: moduleTheme.accent }}
              >
                <Library size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate">{p.nome}</p>
                <p className="text-[10px] opacity-40 mt-0.5">
                  {p.totalVoci.toLocaleString('it-IT')} voci · caricato il {new Date(p.dataImport).toLocaleDateString('it-IT')}
                </p>
              </div>
              <button
                onClick={() => handleDelete(p)}
                disabled={deletingId === p.id}
                className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-40"
                title="Elimina"
              >
                {deletingId === p.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              </button>
            </div>
          ))}
        </div>
      </motion.div>

      {showUpload && (
        <UploadPrezzarioModal
          existingNames={prezzari.map(p => p.nome)}
          onClose={() => setShowUpload(false)}
          onSaved={(nome, tot) => {
            setShowUpload(false);
            showToast(`Prezzario "${nome}" caricato (${tot.toLocaleString('it-IT')} voci).`, 'success');
            bumpPrezzari();
          }}
        />
      )}
    </div>
  );
};
