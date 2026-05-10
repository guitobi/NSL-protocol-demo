import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import type { LogColor } from '../types';

const COLOR_CLASSES: Record<LogColor, string> = {
  green: 'bg-green-50 border-green-200 text-green-800',
  blue: 'bg-blue-50 border-blue-200 text-blue-800',
  red: 'bg-red-50 border-red-200 text-red-800',
  gray: 'bg-gray-50 border-gray-200 text-gray-600',
};

export function ProtocolLog() {
  const protocolLogs = useStore((state) => state.protocolLogs);
  const activePeerId = useStore((state) => state.activePeerId);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [protocolLogs]);

  // Filter logs for current conversation
  const conversationLogs = protocolLogs.filter(
    (log) =>
      log.from === activePeerId ||
      log.to === activePeerId ||
      log.from === 'server' ||
      log.to === 'server' ||
      log.type === 'HANDSHAKE_OK' ||
      log.type === 'ERROR' ||
      log.type === 'ATTACK_SIM'
  );

  const getColorClass = (color: LogColor): string => {
    return COLOR_CLASSES[color] || COLOR_CLASSES.gray;
  };

  const getIcon = (type: string) => {
    if (type.startsWith('NSL_MSG')) return '🔐';
    if (type === 'HANDSHAKE_OK') return '✅';
    if (type === 'ERROR') return '❌';
    if (type === 'CHAT_MSG') return '💬';
    if (type === 'ATTACK_SIM') return '🔴';
    if (type === 'REGISTER') return '📝';
    if (type === 'PEER_LIST') return '👥';
    return '📋';
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="p-4 border-b bg-white">
        <h3 className="font-semibold text-gray-900">Protocol Log</h3>
        <p className="text-xs text-gray-500 mt-1">Real-time protocol events</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {conversationLogs.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            No protocol events yet
          </div>
        ) : (
          conversationLogs.map((log, idx) => (
            <div
              key={`${log.timestamp}-${idx}`}
              className={`p-3 rounded-lg border text-xs ${getColorClass(log.color)}`}
            >
              <div className="flex items-start gap-2">
                <span className="text-base">{getIcon(log.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold mb-1">{log.type}</div>
                  <div className="text-xs opacity-75 mb-1">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </div>
                  <div className="break-words">{log.description}</div>
                  {log.from && log.to && (
                    <div className="text-xs opacity-60 mt-1">
                      {log.from} → {log.to}
                    </div>
                  )}
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
