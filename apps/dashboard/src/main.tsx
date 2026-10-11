import { lazy, StrictMode, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import HomePage from './HomePage';
import './index.css';

const Dashboard = lazy(() => import('./App'));
const path = window.location.pathname.replace(/\/+$/, '') || '/';
document.title = path === '/dashboard' ? 'Horkos | Dashboard' : 'Horkos | Signed Machine Decisions';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {path === '/' ? <HomePage /> : path === '/dashboard'
      ? <Suspense fallback={<div className="route-loading" role="status">Loading dashboard...</div>}><Dashboard /></Suspense>
      : <div className="route-loading"><h1>Page not found</h1><a href="/">Horkos home</a><a href="/dashboard">Open dashboard</a></div>}
  </StrictMode>
);
