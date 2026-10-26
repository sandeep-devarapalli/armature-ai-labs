import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { talentClient } from './liveTalent';

const errorText = (error: unknown) => error instanceof Error ? error.message : 'Unable to save. Please try again.';

export function availabilityLabel(value?: string) { return value === 'available' ? 'Open to projects' : value === 'unavailable' ? 'Not currently available' : 'Availability unknown'; }

export function useSubmissionAccount() {
  const [user, setUser] = useState<User | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    let alive = true; let generation = 0; let identity: string | null | undefined;
    const check = async () => {
      const current = ++generation;
      try {
        const { data, error: failure } = await talentClient().auth.getUser();
        if (failure && failure.name !== 'AuthSessionMissingError') throw failure;
        if (alive && current === generation) { identity = data.user?.id ?? null; setUser(data.user); setError(''); }
      } catch (failure) { if (alive && current === generation) setError(errorText(failure)); }
      finally { if (alive && current === generation) setLoading(false); }
    };
    const { data } = talentClient().auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      const nextIdentity = session?.user.id ?? null;
      if (identity === nextIdentity) { setUser(session?.user ?? null); return; }
      identity = nextIdentity; ++generation; setLoading(true); setUser(null); setError(''); setEpoch(value => value + 1);
      // Leave the auth callback before making another auth request.
      queueMicrotask(() => { if (alive) void check(); });
    });
    void check();
    return () => { alive = false; ++generation; data.subscription.unsubscribe(); };
  }, []);
  return { user, loading, error, epoch };
}
