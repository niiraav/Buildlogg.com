// Force dark mode class before React renders to avoid FOUC
(function () {
  try {
    const path = window.location.pathname;
    const isAuth = path === '/app/auth' || path.startsWith('/app/auth');
    const stored = localStorage.getItem("buildlogg_dark_mode");
    // Auth pages are always light. In-app pages respect stored preference,
    // defaulting to light (system preference is ignored).
    const isDark = !isAuth && stored !== null ? stored === "true" : false;
    if (isDark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", isDark ? "#0a0a0a" : "#FFFFFF");
  } catch (e) {}
})();

import { db } from './lib/db';

// Expose db in dev mode for seeding demo data
if (import.meta.env.DEV) {
  (window as any).db = db;
}

import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);
