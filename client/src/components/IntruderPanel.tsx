import { useState, useEffect } from 'react';
import { useStore } from '../store';

export function IntruderPanel() {
  const myId = useStore((state) => state.myId);
  const [isAttacking, setIsAttacking] = useState(false);
  const [attackTarget, setAttackTarget] = useState<'Alice' | 'Bob'>('Alice');
  const attackMode = useStore((state) => state.attackMode);

  // Reset button state when attack completes
  useEffect(() => {
    if (attackMode === 'NONE') {
      setIsAttacking(false);
    }
  }, [attackMode]);

  if (myId !== 'Intruder') {
    return null;
  }

  const handleLoweAttack = () => {
    setIsAttacking(true);
    // Attack logic will be handled in App.tsx via store
    useStore.getState().setAttackMode('LOWE');
    useStore.getState().setAttackTarget(attackTarget);
  };

  const handleStopAttack = () => {
    setIsAttacking(false);
    useStore.getState().setAttackMode('NONE');
    useStore.getState().setAttackTarget(null);
  };

  return (
    <div className="bg-red-50 border-2 border-red-300 rounded-lg shadow p-4 mb-4">
      <h2 className="text-xl font-bold mb-4 text-red-700">🔓 Attack Simulator</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Target for Lowe Attack:
          </label>
          <select
            value={attackTarget}
            onChange={(e) => setAttackTarget(e.target.value as 'Alice' | 'Bob')}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-red-500"
            disabled={isAttacking}
          >
            <option value="Alice">Alice (intercept her MSG1, redirect to Bob)</option>
            <option value="Bob">Bob (intercept his MSG1, redirect to Alice)</option>
          </select>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleLoweAttack}
            disabled={isAttacking}
            className="flex-1 px-4 py-3 bg-red-600 text-white rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
          >
            {isAttacking ? '⏳ Waiting for MSG1...' : '🎯 Execute Lowe Attack'}
          </button>
          {isAttacking && (
            <button
              onClick={handleStopAttack}
              className="px-4 py-3 bg-gray-600 text-white rounded hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 font-semibold"
            >
              Stop
            </button>
          )}
        </div>

        <div className="text-sm text-gray-700 bg-white p-3 rounded border">
          <p className="font-semibold mb-2">How it works:</p>
          <ol className="list-decimal list-inside space-y-1 text-xs">
            <li>Wait for {attackTarget} to initiate handshake with Intruder</li>
            <li>Decrypt MSG1 to extract nonce (Na) and identity</li>
            <li>Re-encrypt MSG1 for {attackTarget === 'Alice' ? 'Bob' : 'Alice'}, forging sender identity</li>
            <li>{attackTarget === 'Alice' ? 'Bob' : 'Alice'} responds with MSG2 containing their identity</li>
            <li>{attackTarget} detects identity mismatch and rejects MSG2</li>
            <li>Attack fails due to NSL protocol protection ✓</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
