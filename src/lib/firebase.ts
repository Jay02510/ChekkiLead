/// <reference types="vite/client" />

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, type User } from 'firebase/auth';

// Reads from VITE_FIREBASE_* env vars (see .env.example) when present, so
// this can point at either AI Studio project without a code change.
// Falls back to the original hardcoded chekkiai-leadgen config if the env
// vars aren't set, so existing local setups keep working untouched.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDN39wGYK3KmaipnICZbZ8cLJr01REED_Q",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "chekkiai-leadgen.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "chekkiai-leadgen",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "chekkiai-leadgen.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "341235277004",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:341235277004:web:8c757a0740898619567669",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Firestore rules now check request.auth.token.email against an allowlist
// (see firestore.rules), so anonymous sign-in no longer passes. AuthGate
// renders a Google sign-in screen until a user exists, so by the time any
// Firestore call runs, a signed-in user is guaranteed — this promise just
// resolves once the SDK has reported the first auth state.
export const authReady: Promise<User | null> = new Promise((resolve) => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    unsubscribe();
    resolve(user);
  });
});
