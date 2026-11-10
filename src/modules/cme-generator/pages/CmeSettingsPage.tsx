// ─────────────────────────────────────────────────────────────────────────────
// src/modules/cmeGenerator/pages/CmeSettingsPage.tsx
// Admin-only settings page: manages the Excel template AND prezzarios.
// Regular users cannot see this page (Settings button is hidden for non-admins).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import { Upload, Trash2, FileSpreadsheet, AlertCircle, CheckCircle, BarChart2, Plus, Database, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { uploadTemplate, getTemplateMeta, deleteTemplate, type TemplateMetadata } from '../services/templateService';
import {
  listPrezzarios, savePrezzario, deletePrezzario, parsePrezzarioFile
} from '../services/prezzarioService';
import type { PrezzarioRecord } from '../types';
import type { UserProfile } from '../lib/currentUser';

interface Props {
  user: UserProfile;
  prezzarios: PrezzarioRecord[];
  setPrezzarios: (p: PrezzarioRecord[]) => void;
}

export function CmeSettingsPage({ user, prezzarios, setPrezzarios }: Props) {
  const isAdmin = user.role === 'admin';

  // ── Template state ──────────────────────────────────────────────────────────
  const [isUploading, setIsUploading] = useState(false);
  const [templateMeta, setTemplateMeta] = useState<TemplateMetadata | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);

  // ── Prezzario state ─────────────────────────────────────────────────────────
  const [prezLoading, setPrezLoading] = useState(false);
  const [prezProgress, setPrezProgress] = useState<string | null>(null);
  const [prezError, setPrezError] = useState<string | null>(null);
  const [prezSuccess, setPrezSuccess] = useState<string | null>(null);
  const prezRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTemplate();
  }, []);

  // ── Template handlers ───────────────────────────────────────────────────────

  async function loadTemplate() {
    try {
      const meta = await getTemplateMeta(user.id);
      setTemplateMeta(meta);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleTemplateUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setTemplateError(null);
    setIsUploading(true);
    try {
      const meta = await uploadTemplate(file, user.id);
      setTemplateMeta(meta);
    } catch (err: any) {
      setTemplateError(err.message || 'Errore durante il caricamento del modello.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  }

  async function handleTemplateDelete() {
    if (!confirm('Rimuovere il modello base?')) return;
    try {
      await deleteTemplate(user.id);
      setTemplateMeta(null);
    } catch (err: any) {
      setTemplateError(err.message || 'Errore durante la rimozione del modello.');
    }
  }

  // ── Prezzario handlers ──────────────────────────────────────────────────────

  async function handlePrezzarioUpload(file: File) {
    setPrezError(null); setPrezSuccess(null);
    setPrezLoading(true);
    setPrezProgress('Lettura del file in corso...');
    try {
      const voci = await parsePrezzarioFile(file);
      setPrezProgress(`Salvataggio di ${voci.length} voci su Supabase...`);
      const name = file.name.replace(/\.[^.]+$/, '');
      await savePrezzario(name, voci, user.id);
      const updated = await listPrezzarios();
      setPrezzarios(updated);
      setPrezSuccess(`✓ Prezzario "${name}" salvato con ${voci.length.toLocaleString('it-IT')} voci`);
    } catch (e: any) {
      setPrezError(`Errore: ${e.message}`);
    } finally {
      setPrezLoading(false);
      setPrezProgress(null);
    }
  }

  async function handlePrezzarioDelete(id: number, nome: string) {
    if (!window.confirm(`Eliminare il prezzario "${nome}" e tutte le sue voci?`)) return;
    try {
      await deletePrezzario(id);
      const updated = await listPrezzarios();
      setPrezzarios(updated);
      setPrezSuccess('Prezzario eliminato.');
    } catch (e: any) {
      setPrezError(`Errore durante l'eliminazione: ${e.message}`);
    }
  }

  // ── If not admin, show access denied ───────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center mx-auto">
            <Lock size={28} className="text-white/20" />
          </div>
          <p className="text-gray-500 dark:text-white/40 font-bold">Accesso limitato</p>
          <p className="text-white/20 text-sm">Queste impostazioni sono riservate all'amministratore.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-8">

        <div>
          <h1 className="text-2xl font-bold">Impostazioni del CME</h1>
          <p className="text-gray-500 dark:text-white/40 text-sm mt-1">
            Gestione del modello di esportazione e dei prezzari di sistema. Accesso riservato all'amministratore.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* ── Panel A: Template Base ─────────────────────────────────────── */}
          <div className="p-6 rounded-2xl bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#E94560]/20 flex items-center justify-center text-[#E94560]">
                <FileSpreadsheet size={20} />
              </div>
              <div>
                <h2 className="font-bold text-lg leading-tight">Modello Base (Excel)</h2>
                <p className="text-xs text-gray-500 dark:text-white/40">File utilizzato per l'esportazione finale compilata</p>
              </div>
            </div>

            {templateError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 flex gap-2 text-xs">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <p>{templateError}</p>
              </div>
            )}

            {templateMeta ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle size={18} className="text-emerald-400" />
                    <div>
                      <p className="text-sm font-medium">{templateMeta.fileName}</p>
                      <p className="text-xs text-gray-500 dark:text-white/40">
                        Caricato il {new Date(templateMeta.uploadedAt).toLocaleDateString('it-IT')} •{' '}
                        {(templateMeta.sizeBytes / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleTemplateDelete}
                    className="p-2 text-gray-500 dark:text-white/40 hover:text-red-400 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                    title="Rimuovi il modello"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
                  <p className="text-xs text-blue-300">
                    <strong>Colonne previste:</strong> WBSs1, WBSs2, WBSs3, Tariffa, Descrizione, UM, Quantità, PU, Totale.
                    <br />Il sistema conserva la formattazione durante l'esportazione.
                  </p>
                </div>
                <label className="relative overflow-hidden flex items-center justify-center gap-2 px-4 py-2 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-sm font-medium rounded-lg cursor-pointer transition-colors">
                  <Upload size={14} />
                  {isUploading ? 'Caricamento...' : 'Sostituisci modello'}
                  <input type="file" accept=".xlsx" className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={handleTemplateUpload} disabled={isUploading} />
                </label>
              </motion.div>
            ) : (
              <div className="p-8 rounded-xl border border-dashed border-gray-300 dark:border-white/20 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-400 dark:text-white/30">
                  <Upload size={20} />
                </div>
                <div>
                  <p className="text-sm font-medium">Nessun modello caricato</p>
                  <p className="text-xs text-gray-500 dark:text-white/40 mt-1 max-w-[250px]">
                    Carica il file .xlsx di base per i computi.
                  </p>
                </div>
                <label className="relative overflow-hidden px-4 py-2 mt-2 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-sm font-medium rounded-lg cursor-pointer transition-colors">
                  {isUploading ? 'Caricamento...' : 'Seleziona .xlsx'}
                  <input type="file" accept=".xlsx" className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={handleTemplateUpload} disabled={isUploading} />
                </label>
              </div>
            )}
          </div>

          {/* ── Panel B: Prezzarios ────────────────────────────────────────── */}
          <div className="p-6 rounded-2xl bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0F3460]/60 flex items-center justify-center text-blue-400">
                  <BarChart2 size={20} />
                </div>
                <div>
                  <h2 className="font-bold text-lg leading-tight">PREZZARI</h2>
                  <p className="text-xs text-gray-500 dark:text-white/40">Condivisi con tutti gli utenti</p>
                </div>
              </div>
              <button
                onClick={() => prezRef.current?.click()}
                disabled={prezLoading}
                className="flex items-center gap-2 px-3 py-2 bg-[#E94560]/20 hover:bg-[#E94560]/40 border border-[#E94560]/30 rounded-xl text-[#E94560] text-xs font-bold transition-colors disabled:opacity-50"
              >
                <Plus size={14} />
                {prezProgress ?? 'Carica'}
              </button>
              <input ref={prezRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => e.target.files?.[0] && handlePrezzarioUpload(e.target.files[0])} />
            </div>

            <AnimatePresence>
              {prezError && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 flex gap-2 text-xs">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <p>{prezError}</p>
                </motion.div>
              )}
              {prezSuccess && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 flex gap-2 text-xs">
                  <CheckCircle size={14} className="shrink-0 mt-0.5" />
                  <p>{prezSuccess}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {prezLoading && prezProgress && (
              <div className="bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-[#E94560] border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-600 dark:text-white/60 text-xs">{prezProgress}</span>
              </div>
            )}

            {prezzarios.length === 0 ? (
              <div className="border-2 border-dashed border-gray-300 dark:border-white/10 rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
                <Database size={32} className="text-white/20" />
                <p className="text-gray-500 dark:text-white/40 text-sm">Nessun prezzario caricato</p>
                <p className="text-white/20 text-xs">Carica un file .xlsx o .csv del prezzario DEI o Sicilia</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {prezzarios.map(p => (
                  <div key={p.id} className="bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-gray-900 dark:text-white font-medium text-sm">{p.nome}</p>
                      <p className="text-gray-500 dark:text-white/40 text-xs">
                        {p.totalVoci.toLocaleString('it-IT')} voci · {new Date(p.dataImport).toLocaleDateString('it-IT')}
                      </p>
                    </div>
                    <button
                      onClick={() => handlePrezzarioDelete(p.id!, p.nome)}
                      className="p-2 text-gray-400 dark:text-white/30 hover:text-red-400 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-white/5"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Panel C: Intelligenza Artificiale ───────────────────────────────── */}
        <div className="p-6 rounded-2xl bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400">
            <Lock size={20} />
          </div>
          <div>
            <h2 className="font-bold text-lg leading-tight">Intelligenza Artificiale</h2>
            <p className="text-xs text-gray-500 dark:text-white/40">
              L'abbinamento ai prezzari e la Chat IA usano Claude (Anthropic) con la stessa chiave della piattaforma, configurata nel file .env (VITE_ANTHROPIC_API_KEY).
            </p>
          </div>
        </div>

        {/* Info box */}
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <p className="text-xs text-amber-300/80">
            <strong>Nota:</strong> I prezzari caricati qui sono disponibili per tutti gli utenti del sistema.
            Il modello di base definisce il formato del file Excel esportato nella fase finale.
          </p>
        </div>
      </div>
    </div>
  );
}
