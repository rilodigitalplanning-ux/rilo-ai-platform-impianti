// src/modules/cmeGenerator/pages/ChatView.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { chatCommand } from '../services/claudeService';
import { useCme } from '../context/CmeContext';
import type { ChatMessage } from '../types';

interface ChatViewProps { selectedId: string | null }

export function ChatView({ selectedId }: ChatViewProps) {
  const { state, getEffectiveResult, dispatch } = useCme();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const result = selectedId ? getEffectiveResult(selectedId) : null;
  const history = selectedId ? (state.chatHistory.get(selectedId) ?? []) : [];

  useEffect(() => {
    setLocalMessages(history);
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localMessages]);

  async function send() {
    if (!input.trim() || !selectedId || !result || busy) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: new Date().toISOString() };
    const newMessages = [...localMessages, userMsg];
    setLocalMessages(newMessages);
    dispatch({ type: 'ADD_CHAT_MSG', payload: { id: selectedId, msg: userMsg } });
    setInput('');
    setBusy(true);

    try {
      const { mensagem, alteracoes } = await chatCommand(selectedId, userMsg.content, result, history);
      const aiMsg: ChatMessage = { role: 'assistant', content: mensagem, timestamp: new Date().toISOString() };
      setLocalMessages(prev => [...prev, aiMsg]);
      dispatch({ type: 'ADD_CHAT_MSG', payload: { id: selectedId, msg: aiMsg } });
      if (Object.keys(alteracoes).length > 0) {
        dispatch({ type: 'APPLY_OVERRIDE', payload: { id: selectedId, changes: alteracoes } });
      }
    } catch (e) {
      const errMsg: ChatMessage = { role: 'assistant', content: `Errore: ${String(e)}`, timestamp: new Date().toISOString() };
      setLocalMessages(prev => [...prev, errMsg]);
    } finally {
      setBusy(false);
    }
  }

  if (!selectedId || !result) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-white/30 gap-4">
        <Bot size={48} className="opacity-30" />
        <p className="text-sm">Seleziona un elemento nella scheda Computo per avviare la chat</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Context banner */}
      <div className="px-6 py-3 border-b border-gray-200 dark:border-white/5 bg-[#0F3460]/20">
        <p className="text-xs text-gray-500 dark:text-white/40 uppercase tracking-widest">Elemento selezionato</p>
        <p className="text-gray-900 dark:text-white font-bold text-sm truncate">{result.descrizioneElemento}</p>
        <p className="text-gray-500 dark:text-white/40 text-xs">{result.edificio} / {result.livello} · €{result.total.toFixed(2)} · {result.status === 'NAO_ENCONTRADO' ? 'NON TROVATO' : result.status}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
        {localMessages.length === 0 && (
          <div className="text-center text-gray-400 dark:text-white/30 text-sm pt-8">
            <p>Fai una domanda su questo elemento o correggi i dati.</p>
            <p className="text-xs mt-2 text-white/20">Es: "Cambia il valore a 3,50" · "Perché è in ALERT?" · "Raddoppia la quantità"</p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {localMessages.map((msg, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                ${msg.role === 'user' ? 'bg-[#E94560]/20 border border-[#E94560]/30' : 'bg-gray-200 dark:bg-white/10 border border-gray-300 dark:border-white/10'}`}>
                {msg.role === 'user' ? <User size={14} className="text-[#E94560]" /> : <Bot size={14} className="text-gray-600 dark:text-white/60" />}
              </div>
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed
                ${msg.role === 'user'
                  ? 'bg-[#E94560]/15 border border-[#E94560]/20 text-gray-900 dark:text-white ml-auto'
                  : 'bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 text-gray-800 dark:text-white/80'}`}>
                {msg.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {busy && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-white/10 border border-gray-300 dark:border-white/10 flex items-center justify-center">
              <Bot size={14} className="text-gray-600 dark:text-white/60" />
            </div>
            <div className="bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-2xl px-4 py-3 flex gap-1.5 items-center">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 pb-6 pt-3 border-t border-gray-200 dark:border-white/5">
        <div className="flex gap-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            disabled={busy}
            placeholder="Scrivi un comando o una domanda..."
            className="flex-1 bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-[#E94560]/40"
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            className="w-12 h-12 bg-gradient-to-br from-[#0F3460] to-[#E94560] rounded-xl flex items-center justify-center disabled:opacity-30 transition-opacity"
          >
            <Send size={18} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
