import React, { useEffect, useState } from 'react';
import { authClient } from '../lib/auth-client';

interface PasskeyItem {
  id: string;
  name?: string | null;
  createdAt?: string;
}

export default function PasskeyManager() {
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('My device');
  const [error, setError] = useState<string | null>(null);

  const toItem = (p: any): PasskeyItem => ({
    id: String(p.id),
    name: p.name ?? null,
    createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await authClient.passkey.listUserPasskeys();
      if (res?.error) setError(res.error.message || 'Failed to load passkeys');
      const items = Array.isArray(res?.data) ? res.data.map(toItem) : [];
      setPasskeys(items);
    } catch (e: any) {
      setError(e?.message || 'Failed to load passkeys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await authClient.passkey.addPasskey({ name, authenticatorAttachment: 'cross-platform' });
      if (res?.error) setError(res.error.message || 'Failed to add passkey');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to add passkey');
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await authClient.passkey.deletePasskey({ id });
      if (res?.error) setError(res.error.message || 'Failed to delete passkey');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to delete passkey');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-white">Passkeys</h2>
        <p className="text-sm text-gray-400">Register a passkey to enable passwordless sign-in.</p>
      </div>

      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-3">
        <div className="flex gap-2 items-center">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg bg-gray-700/50 border border-gray-600 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Device name (optional)"
          />
          <button
            onClick={add}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
          >
            {loading ? 'Processing...' : 'Add Passkey'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-400">{error}</div>
      )}

      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
        {loading && passkeys.length === 0 ? (
          <div className="text-gray-400 text-sm">Loading...</div>
        ) : passkeys.length === 0 ? (
          <div className="text-gray-400 text-sm">No passkeys yet.</div>
        ) : (
          <ul className="space-y-2">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between bg-gray-700/40 rounded-lg px-3 py-2">
                <div className="text-sm text-gray-200">
                  <div className="font-medium">{p.name || 'Unnamed passkey'}</div>
                  {p.createdAt && (
                    <div className="text-gray-400 text-xs">Created {new Date(p.createdAt).toLocaleString()}</div>
                  )}
                </div>
                <button
                  onClick={() => remove(p.id)}
                  className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs"
                  disabled={loading}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
