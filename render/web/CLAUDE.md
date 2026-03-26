# render/web — Web Rendering Layer

## Purpose

FastAPI backend + React/Vite/Tailwind/shadcn frontend.
Loads engines from config.json, exposes a REST API, serves the built React app.

## Files

| File/Folder | Purpose |
|---|---|
| `server.py` | FastAPI app — engine registry, API routes, static file serving |
| `index.html` | Vite entry point |
| `vite.config.js` | Vite config — aliases, dev proxy to FastAPI |
| `tailwind.config.js` | Tailwind config — CSS variable-based color system |
| `postcss.config.js` | PostCSS — required by Tailwind |
| `package.json` | React 18 + shadcn deps (Radix UI, class-variance-authority, etc.) |
| `src/index.css` | Tailwind base + CSS variable definitions |
| `src/lib/utils.js` | `cn()` helper (clsx + tailwind-merge) |
| `src/components/ui/` | shadcn/ui components (Button, Card, Badge, etc.) |
| `src/components/` | App-level components (EngineStatus, QueryPanel, ResultView) |
| `src/App.jsx` | Root shell — fetches engines, manages state, renders layout |
| `src/main.jsx` | React entry point |
| `dist/` | Built output (created by `npm run build`) — gitignore this |

## API Routes (server.py)

| Method | Route | Returns |
|---|---|---|
| GET | `/api/engines` | All loaded engines + primary ID |
| GET | `/api/engines/{name}` | Single engine status |
| GET | `/api/engines/{name}/schema` | Engine query schema |
| POST | `/api/engines/{name}/query` | Query result |

## Development

```bash
# Terminal 1: start API
python main.py

# Terminal 2: start Vite dev server (hot reload)
cd render/web && npm install && npm run dev
```

App runs at `http://localhost:5173`. API calls proxy to `http://localhost:8000`.

## Production

```bash
python main.py --build    # runs npm run build
python main.py            # serves dist/ as static files from FastAPI
```

App runs at `http://localhost:8000`.

## Adding UI Components

- shadcn components go in `src/components/ui/` — copy from shadcn docs, they're just files
- App-level components go in `src/components/`
- Never import from `data/` inside any component — all data goes through the API

## Adding a Result Type

If an engine returns a new `result_type`, add a renderer branch to `src/components/ResultView.jsx`.
The engine contract defines the shape; ResultView renders it. Nothing else needs to change.
