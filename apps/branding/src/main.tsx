import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AppRoutes } from './routes/AppRoutes';
import './styles/globals.css';

const rootElement = document.getElementById('root');

if (rootElement) {
  if (rootElement.hasChildNodes()) {
    ReactDOM.hydrateRoot(
      rootElement,
      <React.StrictMode>
        <HelmetProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </HelmetProvider>
      </React.StrictMode>
    );
  } else {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <HelmetProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </HelmetProvider>
      </React.StrictMode>
    );
  }
}
