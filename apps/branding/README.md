# Plinth Branding Website

The official marketing and product showcase website for Plinth Industrial Cloud ERP. Built as a high-performance, single-page application with static prerendering (SSG) for search indexing and link previews.

## Tech Stack
- **Framework**: Vite + React 18 + TypeScript (strict mode)
- **Routing**: React Router v6 (`BrowserRouter` with static HTML hydration)
- **Styling**: Tailwind CSS (customized to only use tokens defined in `PLINTH_THEME.txt`)
- **Typography**: Plus Jakarta Sans & JetBrains Mono (self-hosted via `@fontsource`)
- **Icons**: Lucide React
- **Meta & SEO**: React Helmet Async + JSON-LD `SoftwareApplication` schema
- **Forms**: React Hook Form + Zod validation
- **Testing**: Vitest + Playwright (Desktop and Mobile Chrome)
- **Prerendering**: Custom Vite SSR script generating static HTML files for every route

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Supported variables:
- `VITE_APP_URL`: The ERP web sign-in URL.
- `VITE_FORM_ENDPOINT`: Optional POST endpoint for demo request submissions.
- `VITE_WHATSAPP_NUMBER`: Direct WhatsApp contact link.
- `VITE_CONTACT_EMAIL`: Direct team contact email.
- `VITE_ANALYTICS_DOMAIN`: Plausible analytics domain.

### 3. Local Development
```bash
npm run dev
```

### 4. Verification Suite
Run the full automated verification suite (Theme audit, TypeScript check, Unit tests, SSG Build, and Playwright E2E):
```bash
npm run verify
```

## Adding a New Product Edition
Plinth uses a single source of truth for all product data:
1. Open `src/content/products.ts`.
2. Add a new product object conforming to the `Product` TypeScript interface.
3. The new edition will automatically appear in:
   - Navigation mega menu and mobile drawer
   - Home page edition selector
   - `/products` catalog overview
   - Dynamic detail route `/products/:slug`
   - Command palette (Cmd+K)
   - Prerendered HTML builds and `sitemap.xml`
