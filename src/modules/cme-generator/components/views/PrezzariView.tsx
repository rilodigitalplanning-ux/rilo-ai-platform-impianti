import React, { useEffect, useState } from 'react';
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

  const btn = 'flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-semibold transition-colors';

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-[#0B1018] text-slate-900 dark:text-slate-100">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-slate-200 dark:border-white/10">
        <h2 className="text-[14px] font-bold">Prezzari</h2>
        <span className="text-[12px] text-slate-500 dark:text-slate-400">
          {loading ? 'Caricamento…' : `${prezzari.length} nel database · ${totalVoci.toLocaleString('it-IT')} voci · condivisi con tutti gli utenti`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={refresh} disabled={loading} title="Aggiorna" aria-label="Aggiorna"
            className="p-1.5 rounded border border-slate-300 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowUpload(true)} className={`${btn} text-white`} style={{ backgroundColor: moduleTheme.primary }}>
            <Plus size={13} /> Carica nuovo prezzario
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[12px] text-red-700 dark:text-red-300">{error}</div>
      )}

      <div className="flex-1 overflow-auto">
        {loading && prezzari.length === 0 && (
          <div className="flex justify-center py-16 opacity-40"><Loader2 className="animate-spin" /></div>
        )}

        {!loading && !error && prezzari.length === 0 && (
          <div className="text-center py-20 text-slate-500 dark:text-slate-400">
            <Library size={32} className="mx-auto opacity-30 mb-3" />
            <p className="text-sm font-semibold">Nessun prezzario caricato</p>
            <p className="text-[12px] mt-1">Carica un file Excel o PDF per iniziare.</p>
          </div>
        )}

        {prezzari.length > 0 && (
          <table className="w-full text-[12px] border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-[#0E1522]">
              <tr className="text-left text-[11px] text-slate-500 dark:text-slate-400">
                <th className="px-4 py-1.5 font-semibold border-b border-slate-200 dark:border-white/10">Nome</th>
                <th className="py-1.5 font-semibold text-right border-b border-slate-200 dark:border-white/10 w-32">Voci</th>
                <th className="py-1.5 pl-6 font-semibold border-b border-slate-200 dark:border-white/10 w-44">Caricato il</th>
                <th className="px-4 py-1.5 border-b border-slate-200 dark:border-white/10 w-20" />
              </tr>
            </thead>
            <tbody>
              {prezzari.map(p => (
                <tr key={p.id} className="border-t border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5">
                  <td className="px-4 py-1.5">
                    <div className="flex items-center gap-2 font-semibold">
                      <Library size={14} className="shrink-0" style={{ color: moduleTheme.accent }} />
                      <span className="truncate max-w-[560px]">{p.nome}</span>
                    </div>
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{p.totalVoci.toLocaleString('it-IT')}</td>
                  <td className="py-1.5 pl-6 font-mono text-[11px] text-slate-600 dark:text-slate-300">{new Date(p.dataImport).toLocaleDateString('it-IT')}</td>
                  <td className="px-4 py-1.5 text-right">
                    <button
                      onClick={() => handleDelete(p)} disabled={deletingId === p.id}
                      className="p-1 rounded text-red-500 hover:bg-red-500/10 disabled:opacity-40" title="Elimina" aria-label="Elimina"
                    >
                      {deletingId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
