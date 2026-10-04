import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, type User } from 'firebase/auth';
import { auth, googleProvider } from './lib/firebase';
import { Loader2 } from 'lucide-react';

// Gates the whole app behind Google sign-in. Firestore rules only allow
// reads/writes from one allowlisted email (see firestore.rules); without
// this screen, every Firestore call in App.tsx would just fail for anyone
// who isn't that user.
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setChecking(false);
    });
  }, []);

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!user) {
    const handleSignIn = async () => {
      setSigningIn(true);
      setError(null);
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Sign-in failed');
      } finally {
        setSigningIn(false);
      }
    };

    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-zinc-950">
        <h1 className="text-lg font-semibold text-zinc-100">Chekki Lead Gen</h1>
        <button
          onClick={handleSignIn}
          disabled={signingIn}
          className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
        >
          {signingIn ? 'Signing in…' : 'Sign in with Google'}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  return <>{children}</>;
}
