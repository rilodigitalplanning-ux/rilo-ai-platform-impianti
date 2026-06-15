import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X, Send, Bot, User, Zap, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { sendAIMessage } from '../utils/chatAI';
import type { ChatMessage } from '../utils/chatAI';
import type { AppTab } from '../context/AppContext';

export const AIChat: React.FC = () => {
  const { moduleTheme, currentProject, setCurrentProject, setActiveTab } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Ciao! Sono il tuo assistente AI per l\'analisi dei carichi elettrici. Puoi descrivermi il progetto — tipologia, zone, carichi speciali — e io configurerò tutto direttamente nell\'applicazione. Come posso aiutarti?'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY ?? '';
      if (!apiKey) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '⚠️ Chiave API non configurata. Aggiungi VITE_ANTHROPIC_API_KEY nel file .env per abilitare l\'assistente AI.'
        }]);
        return;
      }

      const { response, toolActions } = await sendAIMessage({
        messages: [...messages, userMsg],
        projectState: currentProject,
        apiKey,
        onToolCall: (toolName, toolInput, result) => {
          if (toolName === 'set_project_parameters' && result.project) {
            setCurrentProject(result.project);
          }
          if (toolName === 'add_zone' && result.project) {
            setCurrentProject(result.project);
          }
          if (toolName === 'add_special_load' && result.project) {
            setCurrentProject(result.project);
          }
          if (toolName === 'trigger_calculation' && result.project) {
            setCurrentProject(result.project);
            setActiveTab('results');
          }
          if (toolName === 'navigate_to_tab') {
            setActiveTab(toolInput.tab as AppTab);
          }
        }
      });

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response,
        toolActions
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ Errore: ${msg}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 w-10 flex flex-col items-center justify-center py-4 gap-2 rounded-l-2xl text-white shadow-lg transition-all hover:w-12"
        style={{ background: `linear-gradient(180deg, ${moduleTheme.primary}, ${moduleTheme.accent})` }}
        title="Apri assistente AI"
      >
        <MessageSquare size={18} />
        <span
          className="text-[8px] font-black uppercase tracking-widest"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          AI
        </span>
      </button>

      {/* Sliding panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: 380 }}
            animate={{ x: 0 }}
            exit={{ x: 380 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 h-screen w-[380px] z-50 flex flex-col bg-white dark:bg-[#141414] border-l border-black/10 dark:border-white/10 shadow-2xl"
          >
            {/* Header */}
            <div
              className="flex items-center justify-between p-4 border-b border-black/10 dark:border-white/10 flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${moduleTheme.primary}, ${moduleTheme.accent})` }}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                  <Bot size={16} className="text-white" />
                </div>
                <div>
                  <p className="text-[11px] font-black text-white uppercase tracking-widest">AI ASSISTANT</p>
                  <p className="text-[9px] text-white/60 font-bold uppercase tracking-widest">Co-ingegnere elettrico</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all"
              >
                <X size={14} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div
                    className={`w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center ${
                      msg.role === 'user' ? 'bg-black/10 dark:bg-white/10' : ''
                    }`}
                    style={msg.role === 'assistant' ? { backgroundColor: `${moduleTheme.accent}20` } : {}}
                  >
                    {msg.role === 'user'
                      ? <User size={12} className="dark:text-white opacity-60" />
                      : <Bot size={12} style={{ color: moduleTheme.accent }} />
                    }
                  </div>
                  <div className="max-w-[280px] space-y-2">
                    {/* Tool action badges */}
                    {msg.toolActions && msg.toolActions.length > 0 && (
                      <div className="space-y-1">
                        {msg.toolActions.map((a, j) => (
                          <div
                            key={j}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest text-white"
                            style={{ backgroundColor: moduleTheme.accent }}
                          >
                            <Zap size={9} />
                            {a}
                          </div>
                        ))}
                      </div>
                    )}
                    <div
                      className={`px-3 py-2.5 rounded-2xl text-[11px] leading-relaxed ${
                        msg.role === 'user'
                          ? 'text-white rounded-tr-sm'
                          : 'bg-black/5 dark:bg-white/5 dark:text-white rounded-tl-sm'
                      }`}
                      style={msg.role === 'user'
                        ? { background: `linear-gradient(135deg, ${moduleTheme.primary}, ${moduleTheme.accent})` }
                        : {}
                      }
                    >
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex gap-3">
                  <div
                    className="w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: `${moduleTheme.accent}20` }}
                  >
                    <Bot size={12} style={{ color: moduleTheme.accent }} />
                  </div>
                  <div className="px-3 py-2.5 rounded-2xl rounded-tl-sm bg-black/5 dark:bg-white/5 flex items-center gap-1.5">
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: moduleTheme.accent }}
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="p-4 border-t border-black/10 dark:border-white/10 flex-shrink-0">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Descrivi il progetto o chiedi aiuto..."
                  rows={2}
                  className="flex-1 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl px-3 py-2 text-[11px] dark:text-white focus:outline-none resize-none custom-scrollbar"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-40 active:scale-95 flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${moduleTheme.primary}, ${moduleTheme.accent})` }}
                >
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
              <p className="text-[9px] opacity-30 dark:text-white/30 mt-1.5 text-center">
                Enter per inviare · Shift+Enter nuova riga
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
