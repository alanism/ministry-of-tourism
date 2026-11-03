import { lazy, Suspense } from 'react';

const TripApp = lazy(() => import('./trip/TripApp').then(module => ({ default: module.TripApp })));

export function App() {
  return <Suspense fallback={<main className="loading" role="status">Opening your workspace…</main>}>
    <TripApp />
  </Suspense>;
}
