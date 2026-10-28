import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter/wght.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="card m-4 p-4 text-income">Toolchain OK ₹1,23,456</div>
  </StrictMode>,
);
