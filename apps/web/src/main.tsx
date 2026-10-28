import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// UnCommon Core type: IBM Plex Sans for the interface, Serif for headings,
// Mono for labels. The faces writers write in come from their chosen pairing
// (writing/fonts.ts).
import '@fontsource/kalam/400.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/ibm-plex-serif/400.css';
import '@fontsource/ibm-plex-serif/400-italic.css';
import '@fontsource/ibm-plex-serif/500.css';
import './writing/fonts';
import { App } from './App';
import './styles.css';
import './writing/writing.css';
import './ui/panels.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
