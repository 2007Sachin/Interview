import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import App from './App.tsx';
import { AdminApp } from './admin/AdminApp.tsx';

// /admin mounts the placement-office dashboard; everything else is the
// student app. (No router needed for two roots.)
const isAdmin = window.location.pathname.startsWith('/admin');

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isAdmin ? <AdminApp /> : <App />}</StrictMode>,
);
