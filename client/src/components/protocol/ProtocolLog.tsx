import { useEffect, useRef } from "react";
import { useStore } from "../../store";
import type { LogColor } from "../../types";
import { EmptyState } from "../shared/ui";

const COLOR_CLASSES: Record<LogColor, string> = {
  green: "bg-green-500/10 border-green-500/20 text-green-400",
  blue: "bg-blue-500/10 border-blue-500/20 text-blue-400",
  red: "bg-red-500/10 border-red-500/20 text-red-400",
  gray: "bg-white/5 border-white/10 text-white/60",
  orange: "bg-orange-500/10 border-orange-500/20 text-orange-400",
};

export function ProtocolLog() {
  const protocolLogs = useStore((state) => state.protocolLogs);
  const activePeerId = useStore((state) => state.activePeerId);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [protocolLogs]);

  // Filter logs for current conversation
  const conversationLogs = protocolLogs.filter(
    (log) =>
      log.from === activePeerId ||
      log.to === activePeerId ||
      log.from === "server" ||
      log.to === "server" ||
      log.type === "HANDSHAKE_OK" ||
      log.type === "ERROR" ||
      log.type === "ATTACK_SIM",
  );

  const getColorClass = (color: LogColor): string => {
    return COLOR_CLASSES[color] || COLOR_CLASSES.gray;
  };

  const getIcon = (type: string) => {
    if (type.startsWith("NSL_MSG")) return "🔐";
    if (type === "HANDSHAKE_OK") return "✅";
    if (type === "ERROR") return "❌";
    if (type === "CHAT_MSG") return "💬";
    if (type === "ATTACK_SIM") return "🔴";
    if (type === "REGISTER") return "📝";
    if (type === "PEER_LIST") return "👥";
    return "📋";
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#09090b] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 bg-[#111113] shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white truncate">
              Protocol Log
            </h3>
            <p className="text-[11px] text-white/40 mt-0.5 truncate">
              {conversationLogs.length} event
              {conversationLogs.length === 1 ? "" : "s"}
            </p>
          </div>
          <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-white/50 shrink-0">
            live
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        {conversationLogs.length === 0 ? (
          <div className="min-h-full flex items-center justify-center p-4">
            <EmptyState
              icon="📋"
              title="No protocol events yet"
              description="Events will appear here as they occur"
            />
          </div>
        ) : (
          conversationLogs.map((log, idx) => (
            <div
              key={`${log.timestamp}-${idx}`}
              className={`p-2.5 rounded-xl border text-[11px] ${getColorClass(log.color)}`}
            >
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-sm flex-shrink-0 mt-0.5">
                  {getIcon(log.type)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="break-words whitespace-pre-wrap leading-snug text-left">
                    {log.description}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
