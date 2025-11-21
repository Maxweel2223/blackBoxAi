import React, { useEffect, useState, useRef } from 'react';
import { Message } from '../types';
import ReactMarkdown from 'react-markdown';

declare global {
  interface Window {
    hljs: any;
  }
}

interface MessageBubbleProps {
  message: Message;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const hasMounted = useRef(false);
  
  // Detect if message is new to trigger animation
  useEffect(() => {
    if (!hasMounted.current) {
        const age = Date.now() - message.timestamp;
        if (age < 2000) {
            setIsNew(true);
        }
        hasMounted.current = true;
    }
  }, [message.timestamp]);

  // Syntax Highlighting
  useEffect(() => {
    if (window.hljs) {
      window.hljs.highlightAll();
    }
  }, [message.content]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleTTS = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    // Chunking logic for long text
    window.speechSynthesis.cancel(); // Reset any previous state
    const text = message.content;
    
    // Split by punctuation to keep natural flow, or strict length if no punctuation
    const chunks: string[] = [];
    // Regex explanation: Match sentences ending in . ! ? OR roughly 200 chars if no punctuation found near
    // Simple approach: Split by sentence, then recombine if too short, or split if too long.
    // Robust approach for Brazil/Chrome: Just play sentence by sentence.
    const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
    
    sentences.forEach(sentence => {
        if (sentence.length > 200) {
            // Force split on commas or spaces if a single sentence is massive
             const subParts = sentence.match(/.{1,200}(\s|$)/g) || [sentence];
             chunks.push(...subParts);
        } else {
            chunks.push(sentence);
        }
    });

    let chunkIndex = 0;

    const speakNextChunk = () => {
        if (chunkIndex >= chunks.length) {
            setIsSpeaking(false);
            return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex]);
        utterance.lang = 'pt-BR';
        utterance.rate = 1.1; // Slightly faster for better engagement
        
        utterance.onend = () => {
            chunkIndex++;
            speakNextChunk();
        };
        
        utterance.onerror = (e) => {
            console.error("TTS Error", e);
            setIsSpeaking(false);
            window.speechSynthesis.cancel();
        };

        window.speechSynthesis.speak(utterance);
    };

    setIsSpeaking(true);
    speakNextChunk();
  };

  // Clean up TTS on unmount
  useEffect(() => {
      return () => {
          if (isSpeaking) window.speechSynthesis.cancel();
      }
  }, [isSpeaking]);

  const components = {
    p: ({ node, children, ...props }: any) => {
        return <p className="mb-3 leading-relaxed text-base text-gray-100 break-words w-full min-w-0" {...props}>{children}</p>;
    },
    li: ({ node, children, ...props }: any) => {
         return <li className="break-words" {...props}>{children}</li>;
    },
    h1: ({ node, ...props }: any) => <h1 className="text-2xl font-semibold text-white mt-6 mb-3 font-display break-words" {...props} />,
    h2: ({ node, ...props }: any) => <h2 className="text-xl font-medium text-white mt-5 mb-2 font-display break-words" {...props} />,
    ul: ({ node, ...props }: any) => <ul className="list-disc list-outside ml-5 mb-4 space-y-1 text-gray-300 break-words" {...props} />,
    ol: ({ node, ...props }: any) => <ol className="list-decimal list-outside ml-5 mb-4 space-y-1 text-gray-300 break-words" {...props} />,
    a: ({ node, ...props }: any) => <a className="text-blue-400 hover:underline break-all" target="_blank" rel="noopener noreferrer" {...props} />,
    code: ({ node, inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '');
      const codeString = String(children).replace(/\n$/, '');
      
      const [blockCopied, setBlockCopied] = React.useState(false);
      
      const handleBlockCopy = () => {
          navigator.clipboard.writeText(codeString);
          setBlockCopied(true);
          setTimeout(() => setBlockCopied(false), 2000);
      }

      return !inline && match ? (
        <div className="code-block-container my-4 rounded-lg overflow-hidden border border-gray-700 max-w-full w-full min-w-0">
          <div className="flex items-center justify-between px-4 py-1.5 bg-[#2d2d2d] border-b border-gray-700">
             <span className="text-xs font-mono text-gray-400 truncate">{match[1]}</span>
             <button onClick={handleBlockCopy} className="text-xs text-gray-400 hover:text-white whitespace-nowrap ml-2 flex items-center gap-1">
                {blockCopied ? (
                    <>
                        <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                        <span>Copiado</span>
                    </>
                ) : (
                    "Copiar Código"
                )}
             </button>
          </div>
          <div className="bg-[#1e1e1e] p-4 overflow-x-auto w-full scrollbar-thin">
            <code className={`${className} whitespace-pre`} {...props}>{children}</code>
          </div>
        </div>
      ) : (
        <code className="bg-gray-800 text-gray-200 px-1.5 py-0.5 rounded text-sm font-mono break-words whitespace-pre-wrap" {...props}>{children}</code>
      );
    }
  };

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} px-1`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-lg overflow-hidden mr-2 flex-shrink-0 mt-1 bg-[#242424] shadow-md hidden sm:block">
           <img src="https://i.imgur.com/O8aFGnm.png" alt="AI" className="w-full h-full object-cover" />
        </div>
      )}

      <div className={`flex flex-col max-w-[95%] md:max-w-[85%] min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`relative px-4 py-3 md:px-5 md:py-3 w-full transition-all shadow-sm ${isUser ? 'bg-[#242424] text-white rounded-2xl rounded-tr-sm' : 'text-gray-200 pl-0 pt-0'} ${!isUser && isNew ? 'message-enter' : ''}`}>
          
          {/* Image Attachment Display */}
          {message.attachment && (
            <div className="mb-3 rounded-lg overflow-hidden border border-gray-700 max-w-sm">
                <img src={message.attachment} alt="User attachment" className="w-full h-auto block" />
            </div>
          )}

          {/* Text Content */}
          <div className="prose prose-invert max-w-none w-full min-w-0 break-words overflow-hidden">
            <ReactMarkdown components={components}>{message.content}</ReactMarkdown>
          </div>
        </div>

        {!isUser && (
          <div className={`flex items-center gap-2 mt-1 ml-0 ${isNew ? 'animate-in fade-in duration-500 delay-200' : ''}`}>
             <button onClick={handleTTS} className={`p-1.5 rounded hover:bg-[#242424] transition-colors ${isSpeaking ? 'text-green-400 bg-[#242424]' : 'text-gray-500 hover:text-white'}`} title="Ouvir">
               {isSpeaking ? (
                 <div className="flex space-x-0.5 items-center h-4 w-4 justify-center">
                    <div className="w-0.5 bg-green-400 h-2 animate-pulse"></div>
                    <div className="w-0.5 bg-green-400 h-3 animate-pulse [animation-delay:0.1s]"></div>
                    <div className="w-0.5 bg-green-400 h-1 animate-pulse [animation-delay:0.2s]"></div>
                 </div>
               ) : (
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg>
               )}
             </button>
             <button onClick={() => copyToClipboard(message.content)} className={`p-1.5 rounded hover:bg-[#242424] transition-colors ${isCopied ? 'text-green-400' : 'text-gray-500 hover:text-white'}`} title="Copiar">
                {isCopied ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                )}
             </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;