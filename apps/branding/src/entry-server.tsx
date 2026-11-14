import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { AppRoutes } from './routes/AppRoutes';

export interface RenderResult {
  html: string;
  helmet: unknown;
}

export function render(url: string, helmetContext: Record<string, unknown> = {}): RenderResult {
  const html = ReactDOMServer.renderToString(
    <React.StrictMode>
      <HelmetProvider context={helmetContext}>
        <StaticRouter location={url}>
          <AppRoutes />
        </StaticRouter>
      </HelmetProvider>
    </React.StrictMode>
  );

  return {
    html,
    helmet: helmetContext.helmet,
  };
}
