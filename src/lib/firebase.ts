/// <reference types="vite/client" />

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

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

// Firestore rules require request.auth != null (see README) — this app has
// no real login, so an anonymous session is the auth token that satisfies
// that check. Every Firestore call in App.tsx awaits this first.
const auth = getAuth(app);
export const authReady = signInAnonymously(auth).then(() => {});
