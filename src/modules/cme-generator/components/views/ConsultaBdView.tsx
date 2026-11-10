import React, { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Paperclip, Send, X, Sparkles, Loader2, MessageSquare, User, ImageIcon } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  listConversations, createConversation, deleteConversation, loadMessages, saveMessage,
  askConsultant, fileToConsultaImage, MAX_IMAGES_PER_MESSAGE,
  type Conversation, type ConsultaMessage, type ConsultaImage,
} from '../../services/consultaService';
import { listPrezzarios } from '../../services/prezzarioService';
import type { PrezzarioRecord } from '../../types';

const SUGGESTIONS = [
  'Cavo FG16OR16 4x6 mmq per posa in cavidotto',
  'Interruttore magnetotermico 4P 32A curva C',
  'Corpo illuminante LED da incasso 60x60',
  'Quadro elettrico di zona da parete, 24 moduli',
];

// ── Mini renderer di testo (grassetto, codice, elenchi) ───────────────────────
function renderInline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-[0.95em]">{part.slice(1, -1)}</code>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function RichText({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul${blocks.length}`} className="space-y-1.5 my-2">
          {list.map((l, i) => (
            <li key={i} className="flex gap-2"><span className="opacity-40">•</span><span>{renderInline(l)}</span></li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  let table: string[][] = [];
  const flushTable = () => {
    if (!table.length) return;
    const [head, ...body] = table;
    blocks.push(
      <div key={`t${blocks.length}`} className="overflow-x-auto my-2">
        <table className="text-[12px] border-collapse">
          <thead>
            <tr>{head.map((c, i) => <th key={i} className="text-left px-2.5 py-1.5 border-b border-black/10 dark:border-white/10 font-bold">{renderInline(c)}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => <td key={ci} className="px-2.5 py-1.5 border-b border-black/5 dark:border-white/5 align-top">{renderInline(c)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    table = [];
  };
  lines.forEach((line, i) => {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flush();
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      if (!cells.every(c => /^:?-{2,}:?$/.test(c))) table.push(cells); // salta la riga separatrice
      return;
    }
    flushTable();
    const m = line.match(/^\s*[-*•]\s+(.*)$/);
    if (m) { list.push(m[1]); return; }
    flush();
    if (line.trim()) blocks.push(<p key={`p${i}`} className="my-1.5">{renderInline(line)}</p>);
  });
  flush();
  flushTable();
  return <div className="text-[13px] leading-relaxed">{blocks}</div>;
}

export const ConsultaBdView: React.FC = () => {
  const { moduleTheme, showToast, prezzariVersion } = useApp();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConsultaMessage[]>([]);
  const [input, setInput] = useState('');
  const [images, setImages] = useState<ConsultaImage[]>([]);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prezzari, setPrezzari] = useState<PrezzarioRecord[]>([]);
  const [lightbox, setLightbox] = useState<ConsultaImage | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  useEffect(() => {
    listConversations().then(setConversations).catch(e => setError(e.message));
  }, []);

  // Si riallinea con i prezzari del database (caricamenti/eliminazioni dalla sezione Prezzari)
  useEffect(() => {
    listPrezzarios().then(setPrezzari).catch(() => {});
  }, [prezzariVersion]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, status]);

  async function openConversation(id: string) {
    setActiveId(id);
    setError(null);
    setMessages([]);
    try {
      const msgs = await loadMessages(id);
      if (activeIdRef.current === id) setMessages(msgs);
    } catch (e: any) {
      setError(e.message);
    }
  }

  function newConversation() {
    setActiveId(null);
    setMessages([]);
    setError(null);
    setInput('');
    setImages([]);
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Eliminare questa conversazione?')) return;
    try {
      await deleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeId === id) newConversation();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (list.length === 0) return;
    const room = MAX_IMAGES_PER_MESSAGE - images.length;
    if (room <= 0) { showToast(`Massimo ${MAX_IMAGES_PER_MESSAGE} immagini per messaggio.`, 'error'); return; }
    try {
      const converted = await Promise.all(list.slice(0, room).map(fileToConsultaImage));
      setImages(prev => [...prev, ...converted]);
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  }

  async function send() {
    const text = input.trim();
    if ((!text && images.length === 0) || sending) return;
    setSending(true);
    setError(null);
    setStatus('Elaborazione della richiesta…');

    const sentImages = images;
    const historyBefore = messages;
    let convId = activeId;
    try {
      if (!convId) {
        const title = (text || 'Ricerca da immagine').slice(0, 60);
        const conv = await createConversation(title);
        convId = conv.id;
        activeIdRef.current = conv.id;
        setActiveId(conv.id);
        setConversations(prev => [conv, ...prev]);
      }
      const userMsg = await saveMessage(convId, 'user', text, sentImages);
      setMessages([...historyBefore, userMsg]);
      setInput('');
      setImages([]);

      const currentPrezzari = await listPrezzarios().catch(() => prezzari);
      setPrezzari(currentPrezzari);

      const answer = await askConsultant({
        history: historyBefore, text, images: sentImages, prezzari: currentPrezzari, onStatus: setStatus,
      });
      const aiMsg = await saveMessage(convId, 'assistant', answer);
      if (activeIdRef.current === convId) setMessages(prev => [...prev, aiMsg]);
      setConversations(prev => {
        const cur = prev.find(c => c.id === convId);
        return cur ? [{ ...cur, updatedAt: new Date().toISOString() }, ...prev.filter(c => c.id !== convId)] : prev;
      });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSending(false);
      setStatus(null);
    }
  }

  const accent = moduleTheme.accent;

  return (
    <div className="flex-1 flex overflow-hidden bg-gray-50 dark:bg-[#060A12] text-gray-900 dark:text-white">
      {/* ── Conversazioni ── */}
      <aside className="w-64 shrink-0 border-r border-gray-200 dark:border-white/5 bg-white dark:bg-[#080C14] flex flex-col">
        <div className="p-4">
          <button
            onClick={newConversation}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: moduleTheme.primary }}
          >
            <Plus size={13} /> Nuova conversazione
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5 custom-scrollbar">
          {conversations.length === 0 && (
            <p className="text-[10px] opacity-40 text-center py-6 px-4">Nessuna conversazione ancora.</p>
          )}
          {conversations.map(c => (
            <div
              key={c.id}
              onClick={() => openConversation(c.id)}
              className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                activeId === c.id ? 'bg-black/5 dark:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <MessageSquare size={13} className="shrink-0 opacity-40" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold truncate">{c.title}</p>
                <p className="text-[9px] opacity-40">{new Date(c.updatedAt).toLocaleDateString('it-IT')}</p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-500/10 rounded transition-opacity"
                title="Elimina"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Chat ── */}
      <section
        className="flex-1 flex flex-col min-w-0 relative"
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
      >
        {dragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-none">
            <p className="text-white font-bold text-sm uppercase tracking-widest">Rilascia l'immagine per allegarla</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
            {messages.length === 0 && !sending && (
              <div className="pt-16 text-center space-y-5">
                <div
                  className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
                  style={{ backgroundColor: `${accent}1a`, color: accent }}
                >
                  <Sparkles size={26} />
                </div>
                <div>
                  <h2 className="text-lg font-black uppercase tracking-tight">Consulente di prezzario</h2>
                  <p className="text-[12px] opacity-50 mt-1 max-w-md mx-auto">
                    Descrivi una lavorazione o un materiale, oppure allega una foto: cerco le voci corrispondenti nei prezzari
                    caricati. Se vuoi, indica un prezzario specifico.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="px-3 py-2 rounded-xl text-[11px] border border-gray-300 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {prezzari.length === 0 && (
                  <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                    Nessun prezzario caricato: caricane uno dalle Impostazioni del Computo Metrico.
                  </p>
                )}
              </div>
            )}

            {messages.map(m => (
              <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
                {m.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white" style={{ backgroundColor: accent }}>
                    <Sparkles size={14} />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    m.role === 'user'
                      ? 'text-white rounded-br-md'
                      : 'bg-white dark:bg-[#141414] border border-gray-200 dark:border-white/10 rounded-bl-md'
                  }`}
                  style={m.role === 'user' ? { backgroundColor: moduleTheme.primary } : undefined}
                >
                  {m.images.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {m.images.map((img, i) => (
                        <img
                          key={i}
                          src={`data:${img.mediaType};base64,${img.data}`}
                          onClick={() => setLightbox(img)}
                          className="w-28 h-28 object-cover rounded-lg cursor-zoom-in border border-white/20"
                          alt="Allegato"
                        />
                      ))}
                    </div>
                  )}
                  {m.role === 'assistant'
                    ? <RichText text={m.content} />
                    : <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{m.content}</p>}
                </div>
                {m.role === 'user' && (
                  <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center bg-black/10 dark:bg-white/10">
                    <User size={14} />
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white" style={{ backgroundColor: accent }}>
                  <Loader2 size={14} className="animate-spin" />
                </div>
                <div className="bg-white dark:bg-[#141414] border border-gray-200 dark:border-white/10 rounded-2xl rounded-bl-md px-4 py-3">
                  <p className="text-[12px] opacity-60">{status ?? 'Sto cercando…'}</p>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-500">{error}</div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* ── Input ── */}
        <div className="border-t border-gray-200 dark:border-white/5 bg-white dark:bg-[#080C14] p-4 shrink-0">
          <div className="max-w-3xl mx-auto">
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {images.map((img, i) => (
                  <div key={i} className="relative">
                    <img src={`data:${img.mediaType};base64,${img.data}`} className="w-16 h-16 object-cover rounded-lg border border-gray-300 dark:border-white/10" alt="Anteprima" />
                    <button
                      onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center"
                      title="Rimuovi"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-2xl border border-gray-300 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-3 py-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="p-2 rounded-lg opacity-50 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-all shrink-0"
                title="Allega immagine"
              >
                {images.length > 0 ? <ImageIcon size={18} /> : <Paperclip size={18} />}
              </button>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                onPaste={e => {
                  const files = Array.from(e.clipboardData.files);
                  if (files.some(f => f.type.startsWith('image/'))) { e.preventDefault(); addFiles(files); }
                }}
                rows={1}
                placeholder="Scrivi cosa cerchi, oppure incolla/allega una foto…"
                className="flex-1 bg-transparent outline-none resize-none text-[13px] py-2 max-h-40 placeholder:opacity-40"
                style={{ fieldSizing: 'content' } as React.CSSProperties}
              />
              <button
                onClick={send}
                disabled={sending || (!input.trim() && images.length === 0)}
                className="p-2.5 rounded-xl text-white shrink-0 transition-opacity disabled:opacity-30"
                style={{ backgroundColor: accent }}
                title="Invia"
              >
                <Send size={16} />
              </button>
            </div>
            <p className="text-[9px] opacity-30 mt-2 text-center">Invio per inviare · Maiusc+Invio per andare a capo · puoi anche trascinare o incollare immagini</p>
          </div>
        </div>
      </section>

      {lightbox && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-8" onClick={() => setLightbox(null)}>
          <img src={`data:${lightbox.mediaType};base64,${lightbox.data}`} className="max-w-full max-h-full rounded-lg" alt="Allegato" />
        </div>
      )}
    </div>
  );
};
