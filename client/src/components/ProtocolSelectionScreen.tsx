import { wsClient, send, isConnected } from '../websocket';
import type { Protocol } from '../types';

export function ProtocolSelectionScreen() {
  const wsConnected = isConnected(wsClient);

  const handleSelectProtocol = (protocol: Protocol) => {
    if (!wsConnected) {
      console.warn('WebSocket not connected');
      return;
    }

    send(wsClient, {
      type: 'SET_PROTOCOL',
      from: 'client',
      to: 'server',
      payload: { protocol },
      timestamp: Date.now(),
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">NSL Protocol Demo</h1>
          <p className="text-gray-600">Оберіть протокол для демонстрації</p>
        </div>

        <div className="space-y-4">
          {/* NSPK Option */}
          <button
            onClick={() => handleSelectProtocol('NSPK')}
            disabled={!wsConnected}
            className="w-full p-6 border-2 border-orange-300 rounded-xl hover:border-orange-500 hover:bg-orange-50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-start gap-4">
              <span className="text-3xl">⚠️</span>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  NSPK — класичний протокол
                </h3>
                <p className="text-sm text-gray-600 mb-2">
                  Needham-Schroeder Public Key (1978)
                </p>
                <div className="bg-orange-100 border border-orange-300 rounded p-3 text-sm">
                  <p className="font-semibold text-orange-800">⚠️ Вразливий до атаки Лоу</p>
                  <p className="text-orange-700 mt-1">
                    MSG2 не містить identity відправника — Intruder може підмінити ключ
                  </p>
                </div>
              </div>
            </div>
          </button>

          {/* NSL Option */}
          <button
            onClick={() => handleSelectProtocol('NSL')}
            disabled={!wsConnected}
            className="w-full p-6 border-2 border-green-300 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-start gap-4">
              <span className="text-3xl">✅</span>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  NSL — модифікований протокол
                </h3>
                <p className="text-sm text-gray-600 mb-2">
                  Needham-Schroeder-Lowe (1995)
                </p>
                <div className="bg-green-100 border border-green-300 rounded p-3 text-sm">
                  <p className="font-semibold text-green-800">✅ Захищений від атаки Лоу</p>
                  <p className="text-green-700 mt-1">
                    MSG2 містить identity відправника — виявляє підміну ключа
                  </p>
                </div>
              </div>
            </div>
          </button>
        </div>

        <div className="mt-6 text-center text-sm">
          {wsConnected ? (
            <span className="text-green-600">🟢 Сервер підключений</span>
          ) : (
            <span className="text-red-500">🔴 Очікування сервера...</span>
          )}
        </div>

        <div className="mt-4 text-center text-sm text-gray-500">
          <p>Демонстрація Man-in-the-Middle атаки та захисту</p>
        </div>
      </div>
    </div>
  );
}
