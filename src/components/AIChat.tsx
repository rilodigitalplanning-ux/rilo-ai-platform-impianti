import React, { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Loader2, CheckCircle2, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useProject } from '../context/ProjectContext';
import { sendChatMessage, type ChatMessage, type ChatAction } from '../utils/chatAI';

interface AIChatProps {
  accentColor: string;
  darkMode: boolean;
}

function ActionBadge({ action }: { action: ChatAction }) {
  const labels: Record<string, string> = {
    addCable: '+ Cavo',
    removeCable: '− Cavo',
    updateStructure: '⚙ Struttura',
    clearCables: '✕ Pulisci',
  };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold bg-white/10 mr-1">
      {labels[action.type] ?? action.type}
    </span>
  );
}

export function AIChat({ accentColor, darkMode }: AIChatProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [pendingActions, setPendingActions] = useState<{ msgIndex: number; actions: ChatAction[] } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { activeProject, setProjectCables, setStructure } = useProject();

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, loading]);

  const applyActions = (actions: ChatAction[]) => {
    for (const action of actions) {
      if (action.type === 'addCable') {
        const newCable = {
          id: crypto.randomUUID(),
          cable: {
            id: crypto.randomUUID(),
            name: action.name,
            diameter: action.diameter,
            type: action.cableType,
            size: action.size,
          },
          quantity: action.quantity,
          tag: action.tag,
        };
        setProjectCables(prev => [...prev, newCable]);
      } else if (action.type === 'removeCable') {
        setProjectCables(prev => prev.filter(pc => pc.tag !== action.tag));
      } else if (action.type === 'updateStructure') {
        setStructure(s => ({
          ...s,
          ...(action.width !== undefined && { width: action.width }),
          ...(action.height !== undefined && { height: action.height }),
          ...(action.fillLimit !== undefined && { fillLimit: action.fillLimit }),
        }));
      } else if (action.type === 'clearCables') {
        setProjectCables([]);
      }
    }
    setPendingActions(null);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading || !activeProject) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setHistory(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setPendingActions(null);

    try {
      const result = await sendChatMessage(activeProject, history, text);
      const assistantMsg: ChatMessage = { role: 'assistant', content: result.text };
      setHistory(prev => {
        const next = [...prev, assistantMsg];
        if (result.actions.length > 0) {
          setPendingActions({ msgIndex: next.length - 1, actions: result.actions });
        }
        return next;
      });
    } catch (e: any) {
      setHistory(prev => [...prev, { role: 'assistant', content: `Errore: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating toggle button */}
      <motion.button
        onClick={() => setOpen(o => !o)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full text-white shadow-xl flex items-center justify-center transition-all"
        style={{ backgroundColor: accentColor, boxShadow: `0 4px 20px ${accentColor}60` }}
        title="Assistente IA"
      >
        <AnimatePresence mode="wait">
          {open
            ? <motion.div key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}><ChevronDown size={20} /></motion.div>
            : <motion.div key="bot" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}><Bot size={20} /></motion.div>
          }
        </AnimatePresence>
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed bottom-22 right-6 z-40 w-[380px] flex flex-col rounded-2xl shadow-2xl overflow-hidden border border-black/10 dark:border-white/10"
            style={{ height: '520px', bottom: '80px' }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ backgroundColor: accentColor }}>
              <Bot size={16} className="text-white" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-white uppercase tracking-widest">Assistente IA</p>
                <p className="text-[9px] text-white/60">Claude Opus · {activeProject?.name}</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/10 transition-colors text-white/60 hover:text-white">
                <X size={14} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white dark:bg-[#141414] custom-scrollbar">
              {history.length === 0 && (
                <div className="text-center py-8 space-y-2">
                  <Bot size={28} className="mx-auto opacity-20 dark:text-white" />
                  <p className="text-[10px] font-bold opacity-30 dark:text-white uppercase tracking-widest">Come posso aiutarti?</p>
                  <div className="space-y-1 mt-4">
                    {[
                      'Aggiungi 2 cavi FG7OR 2.5mm² potenza tag C1',
                      'Cambia la larghezza della struttura a 200mm',
                      'Rimuovi tutti i cavi tag C3',
                    ].map(s => (
                      <button
                        key={s}
                        onClick={() => setInput(s)}
                        className="block w-full text-left px-3 py-2 text-[9px] font-bold rounded-lg border border-black/10 dark:border-white/10 hover:border-[#81292C]/40 hover:bg-[#81292C]/5 transition-all dark:text-white/60 opacity-60 hover:opacity-100"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {history.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[10px] leading-relaxed ${
                    msg.role === 'user'
                      ? 'text-white rounded-br-sm'
                      : 'bg-black/5 dark:bg-white/5 dark:text-white rounded-bl-sm'
                  }`}
                  style={msg.role === 'user' ? { backgroundColor: accentColor } : {}}
                  >
                    {msg.content}
                    {/* Show apply button for assistant messages that have pending actions */}
                    {msg.role === 'assistant' && pendingActions?.msgIndex === i && (
                      <div className="mt-2 pt-2 border-t border-white/20">
                        <div className="flex flex-wrap gap-1 mb-2">
                          {pendingActions.actions.map((a, j) => <ActionBadge key={j} action={a} />)}
                        </div>
                        <button
                          onClick={() => applyActions(pendingActions.actions)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold bg-white/20 hover:bg-white/30 transition-colors text-white"
                        >
                          <CheckCircle2 size={11} />
                          Applica modifiche
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-black/5 dark:bg-white/5 rounded-2xl rounded-bl-sm px-3 py-2">
                    <Loader2 size={14} className="animate-spin opacity-40 dark:text-white" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 px-3 py-3 border-t border-black/5 dark:border-white/5 bg-white dark:bg-[#141414] flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Scrivi un messaggio... (Invio per inviare)"
                rows={1}
                className="flex-1 resize-none bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2 text-[10px] font-medium dark:text-white focus:outline-none focus:ring-2 focus:ring-offset-1 dark:focus:ring-offset-[#141414] transition-all custom-scrollbar"
                style={{ maxHeight: '80px', focusRingColor: accentColor } as any}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="p-2 rounded-xl text-white transition-all disabled:opacity-30 shrink-0"
                style={{ backgroundColor: accentColor }}
              >
                <Send size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
