/// <reference types="vite/client" />

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDN39wGYK3KmaipnICZbZ8cLJr01REED_Q",
  authDomain: "chekkiai-leadgen.firebaseapp.com",
  projectId: "chekkiai-leadgen",
  storageBucket: "chekkiai-leadgen.firebasestorage.app",
  messagingSenderId: "341235277004",
  appId: "1:341235277004:web:8c757a0740898619567669",
  measurementId: "G-JWM3G6VEH1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
