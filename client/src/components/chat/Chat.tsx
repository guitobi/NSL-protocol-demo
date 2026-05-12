import { useState, useEffect, useRef } from "react";
import { useStore } from "../../store";
import { Input, Button, EmptyState } from "../shared/ui";

export function Chat() {
  const [message, setMessage] = useState("");
  const chatMessages = useStore((state) => state.chatMessages);
  const fsmState = useStore((state) => state.fsmState);
  const addChatMessage = useStore((state) => state.addChatMessage);
  const myId = useStore((state) => state.myId);
  const activePeerId = useStore((state) => state.activePeerId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSend = () => {
    if (!message.trim() || !myId || !activePeerId) return;

    addChatMessage({
      from: myId,
      to: activePeerId,
      text: message.trim(),
      timestamp: Date.now(),
    });

    setMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isDisabled = fsmState !== "SESSION";

  // Filter messages for current conversation
  const conversationMessages = chatMessages.filter(
    (msg) =>
      (msg.from === myId && msg.to === activePeerId) ||
      (msg.from === activePeerId && msg.to === myId),
  );

  // Generate a simple IV preview (first 8 chars of timestamp hash)
  const getIvPreview = (timestamp: number) => {
    const hash = timestamp.toString(16).padStart(8, "0").substring(0, 8);
    return hash;
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#09090b] overflow-hidden">
      {/* Messages area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2">
        {conversationMessages.length === 0 ? (
          <div className="min-h-full flex items-center justify-center p-4">
            {fsmState === "IDLE" && (
              <EmptyState
                icon="🔄"
                title="Initiating secure handshake..."
                description="Establishing encrypted connection"
              />
            )}
            {fsmState === "HANDSHAKE" && (
              <EmptyState
                icon="🔐"
                title="Establishing secure connection..."
                description="Exchanging cryptographic keys"
              />
            )}
            {fsmState === "SESSION" && (
              <EmptyState
                icon="💬"
                title="Secure connection established"
                description="Start messaging with end-to-end encryption"
              />
            )}
            {fsmState === "ERROR" && (
              <EmptyState
                icon="❌"
                title="Connection failed"
                description="Please try again"
              />
            )}
          </div>
        ) : (
          conversationMessages.map((msg, idx) =>
            msg.isSystem ? (
              // System message - centered badge
              <div
                key={`${msg.timestamp}-${idx}`}
                className="flex justify-center my-2"
              >
                <div className="max-w-[85%] bg-white/5 text-white/50 text-[11px] px-3 py-1.5 rounded-full border border-white/10 truncate">
                  {msg.text}
                </div>
              </div>
            ) : (
              // Regular message - bubble
              <div
                key={`${msg.timestamp}-${idx}`}
                className={`flex ${msg.from === myId ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                    msg.from === myId
                      ? "bg-blue-600 text-white rounded-br-md"
                      : "bg-[#1a1a1a] text-white border border-white/10 rounded-bl-md"
                  }`}
                >
                  <div className="text-sm break-words leading-relaxed text-left">
                    {msg.text}
                  </div>
                  <div
                    className={`text-[11px] mt-1.5 flex items-center gap-2 ${
                      msg.from === myId ? "text-blue-200" : "text-white/40"
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <span>🔒</span>
                      <span className="font-mono">
                        {getIvPreview(msg.timestamp)}
                      </span>
                    </span>
                    <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            ),
          )
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-white/10 bg-[#111113] p-3 shrink-0">
        {isDisabled && (
          <div className="mb-2 text-center text-[11px] text-amber-300 bg-amber-500/10 py-1.5 rounded-lg border border-amber-500/20">
            {fsmState === "HANDSHAKE" && "🔄 Completing handshake..."}
            {fsmState === "IDLE" && "🔄 Initiating secure connection..."}
            {fsmState === "ERROR" && "❌ Connection error"}
          </div>
        )}
        <div className="flex gap-2 min-w-0">
          <Input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isDisabled}
            placeholder={
              isDisabled
                ? "Waiting for secure connection..."
                : "Type a message..."
            }
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={isDisabled || !message.trim()}
            className="px-4 shrink-0"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </Button>
        </div>
      </div>
    </div>
  );
}
