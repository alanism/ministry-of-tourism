import { lazy, Suspense, useEffect, useState } from 'react';

const TripApp = lazy(() => import('./trip/TripApp').then(module => ({ default: module.TripApp })));
const WriterApp = lazy(() => import('./WriterApp').then(module => ({ default: module.WriterApp })));

/** Select the document owner before mounting any persistence or agent hooks. */
export function App() {
  const [search, setSearch] = useState(() => location.search);
  useEffect(() => {
    const changed = () => setSearch(location.search);
    window.addEventListener('popstate', changed);
    return () => window.removeEventListener('popstate', changed);
  }, []);
  const view = new URLSearchParams(search).get('view');
  return <Suspense fallback={<main className="loading" role="status">Opening your workspace…</main>}>
    {view === 'board' || view === 'agent' ? <WriterApp /> : <TripApp />}
  </Suspense>;
}
