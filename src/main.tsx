import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@/app/App';
import '@/shared/styles/globals.css';
import { getFirebaseServices } from '@/shared/firebase/client';

// Initialize Firebase services gracefully (online or mock)
getFirebaseServices();

// Register Service Worker for PWA if in production browser
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => console.info('[PWA] Service Worker registered:', reg.scope))
      .catch((err) => console.warn('[PWA] Service Worker registration failed:', err));
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
