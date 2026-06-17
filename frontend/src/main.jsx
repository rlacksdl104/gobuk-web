import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('Service Worker registered:', registration.scope);

      if ('periodicSync' in registration) {
        try {
          await registration.periodicSync.register('posture-reminder', {
            minInterval: 15 * 60 * 1000
          });
          console.log('Periodic Sync registered');
        } catch (error) {
          console.warn('Periodic Sync registration failed:', error);
        }
      }
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  });
}
