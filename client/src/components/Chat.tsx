import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';

export function Chat() {
  const [message, setMessage] = useState('');
  const chatMessages = useStore((state) => state.chatMessages);
  const fsmState = useStore((state) => state.fsmState);
  const addChatMessage = useStore((state) => state.addChatMessage);
  const myId = useStore((state) => state.myId);
  const activePeerId = useStore((state) => state.activePeerId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = () => {
    if (!message.trim() || !myId || !activePeerId) return;

    addChatMessage({
      from: myId,
      to: activePeerId,
      text: message.trim(),
      timestamp: Date.now(),
    });

    setMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isDisabled = fsmState !== 'SESSION';

  // Filter messages for current conversation
  const conversationMessages = chatMessages.filter(
    (msg) =>
      (msg.from === myId && msg.to === activePeerId) ||
      (msg.from === activePeerId && msg.to === myId)
  );

  // Generate a simple IV preview (first 8 chars of timestamp hash)
  const getIvPreview = (timestamp: number) => {
    const hash = timestamp.toString(16).padStart(8, '0').substring(0, 8);
    return hash;
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {conversationMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            {fsmState === 'IDLE' && <p>Initiating secure handshake...</p>}
            {fsmState === 'HANDSHAKE' && <p>Establishing secure connection...</p>}
            {fsmState === 'SESSION' && <p>Secure connection established. Start messaging!</p>}
            {fsmState === 'ERROR' && <p className="text-red-500">Connection failed. Please try again.</p>}
          </div>
        ) : (
          conversationMessages.map((msg, idx) => (
            msg.isSystem ? (
              // System message - gray badge centered
              <div key={`${msg.timestamp}-${idx}`} className="flex justify-center my-2">
                <div className="bg-gray-200 text-gray-600 text-xs px-3 py-1 rounded-full">
                  {msg.text}
                </div>
              </div>
            ) : (
              // Regular message - bubble
              <div
                key={`${msg.timestamp}-${idx}`}
                className={`flex ${msg.from === myId ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                    msg.from === myId
                      ? 'bg-blue-500 text-white rounded-br-sm'
                      : 'bg-gray-200 text-gray-900 rounded-bl-sm'
                  }`}
                >
                  <div className="text-sm break-words">{msg.text}</div>
                  <div
                    className={`text-xs mt-1 flex items-center gap-2 ${
                      msg.from === myId ? 'text-blue-100' : 'text-gray-500'
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <span>🔒</span>
                      <span className="font-mono">{getIvPreview(msg.timestamp)}</span>
                    </span>
                    <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            )
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t bg-white p-4">
        {isDisabled && (
          <div className="mb-2 text-center text-sm text-amber-600 bg-amber-50 py-2 rounded">
            {fsmState === 'HANDSHAKE' && '🔄 Completing handshake...'}
            {fsmState === 'IDLE' && '🔄 Initiating secure connection...'}
            {fsmState === 'ERROR' && '❌ Connection error'}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isDisabled}
            placeholder={isDisabled ? 'Waiting for secure connection...' : 'Type a message...'}
            className="flex-1 px-4 py-3 border rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={isDisabled || !message.trim()}
            className="px-6 py-3 bg-blue-500 text-white rounded-full hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
