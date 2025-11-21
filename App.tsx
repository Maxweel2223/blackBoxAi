import React, { useState, useEffect, useRef } from 'react';
import { initChat, sendMessageToGemini } from './services/geminiService';
import { Message, ChatState, ChatSession } from './types';
import MessageBubble from './components/MessageBubble';
import TypingIndicator from './components/TypingIndicator';

const App: React.FC = () => {
  // State
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem('nexus_forge_sessions');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load sessions", e);
      return [];
    }
  });
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [chatState, setChatState] = useState<ChatState>({ isLoading: false, error: null });
  const [inputText, setInputText] = useState('');
  
  // Sidebar & Layout
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarVisible, setDesktopSidebarVisible] = useState(true);
  
  // UI Elements
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [activeModel, setActiveModel] = useState('Nexus Standard');
  const [ping, setPing] = useState(0);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  
  // Image Handling
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialization & Ping System
  useEffect(() => {
    if (sessions.length === 0) {
      createNewSession();
    } else if (!currentSessionId) {
      setCurrentSessionId(sessions[0].id);
    }

    // Ping simulation (Game-like real-time MS)
    const pingInterval = setInterval(() => {
        // Simulate a fluctuation between 12ms and 45ms
        setPing(Math.floor(Math.random() * (45 - 12 + 1) + 12));
    }, 2000);

    return () => clearInterval(pingInterval);
  }, []);

  useEffect(() => {
    if (currentSessionId) {
      const currentSession = sessions.find(s => s.id === currentSessionId);
      // Map messages for initChat context
      if (currentSession) {
          const simpleHistory = currentSession.messages.map(m => ({role: m.role, content: m.content}));
          initChat(simpleHistory);
      }
    }
  }, [currentSessionId]);

  // Persistence with Quota Protection
  useEffect(() => {
    try {
      // DEEP SANITIZATION: Reconstruct state to avoid circular refs and strip heavy data (images)
      const cleanSessions = sessions.map(s => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        messages: s.messages.map(m => ({
            id: m.id,
            role: m.role,
            content: String(m.content || ""), // Force string
            // NOTE: We intentionally DO NOT save 'attachment' (base64 images) to localStorage 
            // because they exceed the 5MB quota extremely fast, crashing the app.
            timestamp: m.timestamp
        }))
      }));

      const serialized = JSON.stringify(cleanSessions);
      localStorage.setItem('nexus_forge_sessions', serialized);
    } catch (e: any) {
      if (e.name === 'QuotaExceededError') {
          console.warn("LocalStorage quota exceeded. History not saved to prevent crash.");
      } else {
          console.error("Failed to save sessions:", e);
      }
    }
  }, [sessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessions, currentSessionId, chatState.isLoading]);

  // --- Helpers ---

  const getRelativeTime = (timestamp: number) => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 3600 * 24));

    if (diffDays === 0) return 'Hoje';
    if (diffDays === 1) return 'Ontem';
    if (diffDays < 7) return `Há ${diffDays} dias`;
    return date.toLocaleDateString('pt-BR');
  };

  // --- Handlers ---

  // Accept any args to safely ignore Event objects passed by onClick
  const createNewSession = (...args: any[]) => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'Nova Conversa',
      createdAt: Date.now(),
      messages: []
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setMobileSidebarOpen(false);
    initChat([]);
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== id);
    setSessions(newSessions);
    if (currentSessionId === id) {
      if (newSessions.length > 0) setCurrentSessionId(newSessions[0].id);
      else setTimeout(() => createNewSession(), 0);
    }
    setActiveMenuId(null);
  };

  const exportSpecificSession = (e: React.MouseEvent, id: string, format: 'txt' | 'json') => {
    e.stopPropagation();
    const session = sessions.find(s => s.id === id);
    if (!session) return;
    performExport(session, format);
    setActiveMenuId(null);
  };

  const exportCurrentSession = (format: 'txt' | 'json') => {
    const session = sessions.find(s => s.id === currentSessionId);
    if (!session) return;
    performExport(session, format);
    setShowExportDropdown(false);
  };

  const performExport = (session: ChatSession, format: 'txt' | 'json') => {
    let content = '';
    let mimeType = 'text/plain';
    let extension = 'txt';

    if (format === 'json') {
      try {
        content = JSON.stringify(session.messages, null, 2);
      } catch (e) {
        content = "Error exporting JSON";
      }
      mimeType = 'application/json';
      extension = 'json';
    } else {
      content = session.messages.map(m => `[${m.role.toUpperCase()}] (${new Date(m.timestamp).toLocaleString()}): ${m.content}`).join('\n\n');
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus-forge-${session.title.replace(/\s+/g, '-').toLowerCase()}.${extension}`;
    a.click();
  }

  // --- Image Handlers ---

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
              if (event.target?.result && typeof event.target.result === 'string') {
                  setSelectedImage(event.target.result);
              }
          };
          reader.readAsDataURL(file);
      }
      // Reset input so same file can be selected again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearImage = () => {
      setSelectedImage(null);
  };

  // --- Message Sending ---

  const handleSendMessage = async (textOverride?: string | unknown) => {
    // STRICT SANITIZATION
    let textInput = '';
    if (typeof textOverride === 'string') {
        textInput = textOverride;
    } else {
        textInput = inputText.trim();
    }
    
    if (typeof textInput !== 'string') return;

    if ((!textInput && !selectedImage) || chatState.isLoading || !currentSessionId) return;

    // Create user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: String(textInput), 
      attachment: selectedImage || undefined,
      timestamp: Date.now(),
    };

    setInputText('');
    setSelectedImage(null); // Clear image after sending
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setChatState({ ...chatState, isLoading: true, error: null });

    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        const safeTitle = typeof textInput === 'string' ? textInput : 'Nova Conversa';
        const newTitle = s.messages.length === 0 ? (safeTitle.slice(0, 25) + (safeTitle.length > 25 ? '...' : '')) : s.title;
        return { ...s, title: newTitle, messages: [...s.messages, userMessage] };
      }
      return s;
    }));

    try {
      const responseText = await sendMessageToGemini(userMessage.content, userMessage.attachment);
      
      const botMessage: Message = {
        id: (Date.now() + 10).toString(),
        role: 'model',
        content: String(responseText || ""),
        timestamp: Date.now(),
      };

      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) return { ...s, messages: [...s.messages, botMessage] };
        return s;
      }));
      setChatState(prev => ({ ...prev, isLoading: false }));
    } catch (err) {
      setChatState(prev => ({ ...prev, isLoading: false, error: "Falha na conexão." }));
    }
  };

  const handleInputResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
  };

  const currentSession = sessions.find(s => s.id === currentSessionId);

  return (
    <div className="h-dvh flex overflow-hidden bg-black text-white font-sans selection:bg-gray-700 selection:text-white">
      
      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/80 md:hidden backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)}></div>
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-black border-r border-gray-800 flex flex-col transition-all duration-300 ease-in-out
        ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        ${desktopSidebarVisible ? 'md:translate-x-0 md:static md:w-64' : 'md:-translate-x-full md:absolute md:w-0'}
        overflow-hidden
      `}>
        <div className="p-3 border-b border-gray-800">
            <button className="w-full px-3 py-2 rounded-lg bg-transparent hover:bg-[#1A1A1A] border border-gray-800 hover:border-gray-700 text-left flex items-center justify-between text-sm text-white transition-all" onClick={() => createNewSession()}>
                <span>Nova conversa</span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
                </svg>
            </button>
        </div>

        <div className="p-3 border-b border-gray-800">
            <div className="relative">
                <input 
                    type="text" 
                    placeholder="Buscar conversas..." 
                    className="w-full bg-black text-white text-sm px-3 py-2 pl-9 rounded-lg border border-gray-800 focus:border-gray-600 outline-none placeholder-gray-600"
                />
                <svg className="w-4 h-4 text-gray-600 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 scrollbar-hide">
            <div className="space-y-1">
              {sessions.map((session) => (
                <div 
                  key={session.id}
                  className={`group relative flex flex-col px-3 py-3 rounded-lg cursor-pointer transition-colors ${currentSessionId === session.id ? 'bg-[#242424]' : 'hover:bg-[#1A1A1A]'}`}
                  onClick={() => { setCurrentSessionId(session.id); setMobileSidebarOpen(false); }}
                >
                  <div className="flex items-center justify-between">
                      <div className="text-sm font-normal text-gray-200 truncate pr-6 w-full">{session.title}</div>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">
                      {getRelativeTime(session.createdAt)}
                  </div>
                  
                  {/* Menu Trigger */}
                  <button 
                    onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === session.id ? null : session.id); }}
                    className={`absolute right-2 top-3 p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-white ${activeMenuId === session.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/></svg>
                  </button>

                  {/* Context Menu */}
                  {activeMenuId === session.id && (
                    <div className="absolute right-8 top-8 w-36 bg-[#2d2d2d] border border-gray-700 rounded shadow-xl z-50 overflow-hidden py-1">
                       <button onClick={(e) => exportSpecificSession(e, session.id, 'txt')} className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-[#3e3e3e] hover:text-white">Exportar TXT</button>
                       <button onClick={(e) => exportSpecificSession(e, session.id, 'json')} className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-[#3e3e3e] hover:text-white">Exportar JSON</button>
                       <div className="h-px bg-gray-700 my-1"></div>
                       <button onClick={(e) => deleteSession(e, session.id)} className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-[#3e3e3e]">Excluir</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
        </div>

        <div className="p-3 border-t border-gray-800">
             <div className="flex items-center justify-between text-xs text-gray-500 px-3 mb-2">
                 <span>Ping</span>
                 <span className={`${ping > 100 ? 'text-red-500' : 'text-green-500'}`}>{ping}ms</span>
             </div>
             <div className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-[#1A1A1A] cursor-pointer transition-colors">
                <div className="w-6 h-6 rounded flex items-center justify-center bg-gray-800">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">Usuário</div>
                    <div className="text-xs text-gray-500 flex items-center space-x-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 pulsating"></div>
                        <span>Online</span>
                    </div>
                </div>
            </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative w-full min-w-0">
        
        {/* Header */}
        <header className="border-b border-gray-800 px-4 py-2 flex items-center justify-between relative bg-black/95 backdrop-blur z-20 h-14 flex-shrink-0">
            <div className="flex items-center space-x-3 min-w-0 flex-1">
                
                {/* Mobile Toggle */}
                <button className="p-2 rounded-lg md:hidden text-gray-400 hover:text-white" onClick={() => setMobileSidebarOpen(true)}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                </button>
                
                {/* Desktop Toggle */}
                <button 
                    className="p-2 rounded-lg hidden md:block text-gray-400 hover:text-white hover:bg-[#242424] transition-colors" 
                    onClick={() => setDesktopSidebarVisible(!desktopSidebarVisible)}
                    title={desktopSidebarVisible ? "Fechar Sidebar" : "Abrir Sidebar"}
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                </button>

                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded flex items-center justify-center overflow-hidden bg-[#242424]">
                        <img src="https://i.imgur.com/O8aFGnm.png" alt="Logo" className="w-full h-full object-cover" />
                    </div>
                    <span className="text-lg font-semibold text-silver-real font-display tracking-wider hidden sm:inline">NEXUSFORGE</span>
                </div>
            </div>

            {/* Model Selector (Center Desktop) */}
            <div className="absolute left-1/2 transform -translate-x-1/2 hidden md:block">
                <div className="relative">
                    <button 
                      className="px-3 py-1.5 rounded-lg text-sm flex items-center space-x-2 hover:bg-[#242424] transition-colors border border-transparent hover:border-gray-700" 
                      onClick={() => setShowModelDropdown(!showModelDropdown)}
                    >
                        <span className="text-gray-300">{activeModel}</span>
                        <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </button>
                    {showModelDropdown && (
                        <div className="absolute top-[calc(100%+0.5rem)] left-1/2 transform -translate-x-1/2 w-56 bg-[#242424] border border-gray-700 rounded-lg py-1 shadow-2xl z-50">
                             <button onClick={() => {setActiveModel('Nexus Standard'); setShowModelDropdown(false)}} className="w-full text-left px-4 py-2 text-sm hover:bg-[#333] text-white">Nexus Standard</button>
                             <button onClick={() => {setActiveModel('Nexus Pro'); setShowModelDropdown(false)}} className="w-full text-left px-4 py-2 text-sm hover:bg-[#333] text-white">Nexus Pro</button>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center justify-end space-x-1">
                <div className="relative">
                  <button className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#242424]" onClick={() => setShowExportDropdown(!showExportDropdown)} title="Exportar">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                  </button>
                  {showExportDropdown && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-[#242424] border border-gray-700 rounded-lg shadow-xl z-50">
                      <button onClick={() => exportCurrentSession('txt')} className="w-full text-left px-4 py-2 text-sm hover:bg-[#333] text-gray-200">Exportar Texto</button>
                      <button onClick={() => exportCurrentSession('json')} className="w-full text-left px-4 py-2 text-sm hover:bg-[#333] text-gray-200">Exportar JSON</button>
                    </div>
                  )}
                </div>
            </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto scrollbar-hide px-3 sm:px-6 pt-6 flex flex-col w-full" id="chatArea">
           <div className="max-w-3xl md:max-w-5xl mx-auto w-full flex-1 flex flex-col min-w-0">
              
              {/* Welcome Screen */}
              {(!currentSession || currentSession.messages.length === 0) && (
                <div className="flex flex-col items-center justify-center flex-1 py-4 animate-in fade-in duration-700">
                   <div className="text-center space-y-4 mb-8">
                       <div className="w-20 h-20 rounded-lg flex items-center justify-center mx-auto overflow-hidden bg-[#242424] shadow-lg">
                           <img src="https://i.imgur.com/6b5fcYV.png" alt="AI" className="w-full h-full object-cover opacity-80" />
                       </div>
                       <h1 className="text-2xl font-medium text-white font-display">Como posso ajudá-lo hoje?</h1>
                   </div>

                   <div className="flex flex-col gap-3 w-full max-w-2xl px-4">
                      <div className="flex flex-wrap justify-center gap-3">
                          {['Hacking Ético', 'Ganhar Dinheiro', 'Negócios'].map(text => (
                            <button key={text} onClick={() => handleSendMessage(`Fale sobre ${text}`)} className="px-5 py-2.5 rounded-full bg-[#242424] border border-gray-800 hover:bg-[#2e2e2e] transition-colors text-sm text-gray-200 hover:text-white shadow-sm whitespace-nowrap">
                                {text}
                            </button>
                          ))}
                      </div>
                      <div className="flex flex-wrap justify-center gap-3">
                          {['Privacidade', 'Programação', 'Criptomoedas'].map(text => (
                            <button key={text} onClick={() => handleSendMessage(`Fale sobre ${text}`)} className="px-5 py-2.5 rounded-full bg-[#242424] border border-gray-800 hover:bg-[#2e2e2e] transition-colors text-sm text-gray-200 hover:text-white shadow-sm whitespace-nowrap">
                                {text}
                            </button>
                          ))}
                      </div>
                   </div>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 pb-4 w-full">
                  {currentSession?.messages.map((msg) => (
                    <div key={msg.id} className="mb-6 w-full">
                        <MessageBubble message={msg} />
                    </div>
                  ))}
                  {chatState.isLoading && (
                    <div className="ml-12">
                       <TypingIndicator />
                    </div>
                  )}
                  {chatState.error && (
                    <div className="mx-auto max-w-md mt-4 p-3 bg-red-900/30 border border-red-800 rounded text-center text-red-400 text-sm">
                        {chatState.error}
                    </div>
                  )}
                  <div ref={messagesEndRef} className="h-1" />
              </div>
           </div>
        </div>
        
        {/* Footer */}
        <footer className="border-t border-gray-800 p-4 pb-8 md:pb-6 bg-black/95 z-20">
            <div className="max-w-3xl md:max-w-5xl mx-auto w-full">
                
                {/* Image Preview */}
                {selectedImage && (
                    <div className="mb-3 relative inline-block animate-in zoom-in duration-200">
                        <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-600 group">
                            <img src={selectedImage} alt="Preview" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <button onClick={clearImage} className="text-white bg-red-500/80 rounded-full p-1 hover:bg-red-600">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex items-end w-full space-x-3">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className={`flex items-center justify-center w-10 h-10 mb-1 rounded-full bg-[#2d2d2d] hover:bg-[#3d3d3d] transition-colors flex-shrink-0 ${selectedImage ? 'text-green-400 ring-1 ring-green-400' : 'text-white'}`}
                        title="Anexar imagem"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                    </button>
                    
                    <div className="flex items-end flex-grow rounded-[26px] bg-[#242424] border border-gray-800 focus-within:border-gray-600 transition-colors min-w-0">
                        <textarea
                            ref={textareaRef}
                            value={inputText}
                            onChange={handleInputResize}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                            placeholder="Pergunte qualquer coisa..."
                            className="flex-grow px-4 py-3 bg-transparent text-white placeholder-gray-500 focus:outline-none resize-none max-h-[150px] overflow-y-auto leading-relaxed scrollbar-hide min-w-0 w-full"
                            rows={1}
                        ></textarea>
                        
                        <button
                            onClick={() => setIsVoiceActive(!isVoiceActive)}
                            className={`w-10 h-10 mb-1 mr-1 flex items-center justify-center flex-shrink-0 rounded-full hover:bg-[#333] transition-colors ${isVoiceActive ? 'text-red-500 animate-pulse' : 'text-gray-400'}`}
                            title="Entrada de voz"
                        >
                           <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-2c0 3.03-2.43 5.5-5.3 5.5S6.7 15.03 6.7 12H5c0 3.53 2.61 6.43 6 6.9V21h2v-3.1c3.39-.47 6-3.37 6-6.9h-1.7z"/></svg>
                        </button>
                    </div>
                    
                    <button
                        onClick={() => handleSendMessage()}
                        disabled={(!inputText && !selectedImage) || chatState.isLoading}
                        className={`flex items-center justify-center w-10 h-10 mb-1 rounded-full transition-all flex-shrink-0 ${(!inputText && !selectedImage) || chatState.isLoading ? 'bg-[#2d2d2d] text-gray-600 cursor-not-allowed' : 'bg-white text-black hover:bg-gray-200'}`}
                    >
                        {chatState.isLoading ? (
                             <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                             <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                        )}
                    </button>
                </div>

                <div className="flex flex-col items-center justify-center mt-4 text-[11px] text-gray-500 w-full mb-2 md:mb-0">
                    <div className="text-center">
                        <span>ChatGPT pode cometer erros. NEXUSFORGE AI Nunca.</span>
                    </div>
                </div>
            </div>
        </footer>

        {/* Hidden Inputs */}
        <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
        />
      </main>
    </div>
  );
};

export default App;