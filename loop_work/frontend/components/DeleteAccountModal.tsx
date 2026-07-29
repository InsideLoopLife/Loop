import React, { useState } from 'react';

type DeleteAccountModalProps = {
  accessToken: string;
  onDeleted?: () => void;
  onClose?: () => void;
};

export function DeleteAccountModal({ accessToken, onDeleted, onClose }: DeleteAccountModalProps) {
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function deleteAccount() {
    setError('');
    if (confirmation !== 'DELETE') {
      setError('Type DELETE exactly to confirm.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/account/purge', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ confirmation }),
      });

      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || 'Account deletion failed.');
      onDeleted?.();
    } catch (err: any) {
      setError(err.message || 'Account deletion failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 text-slate-950 shadow-2xl">
        <h2 className="text-2xl font-bold">Delete your Inside LOOP account?</h2>
        <p className="mt-3 text-slate-600">
          This will instantly purge your core health, food, household and wealth content from Inside LOOP.
          This action cannot be undone.
        </p>

        <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-800">
          To confirm, type <strong>DELETE</strong> below.
        </div>

        <input
          className="mt-5 w-full rounded-xl border border-slate-300 px-4 py-3"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder="Type DELETE"
        />

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 flex gap-3">
          <button className="rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-900" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="rounded-xl bg-red-600 px-4 py-3 font-bold text-white disabled:opacity-50" onClick={deleteAccount} disabled={busy || confirmation !== 'DELETE'}>
            {busy ? 'Deleting...' : 'Delete everything'}
          </button>
        </div>
      </div>
    </div>
  );
}
