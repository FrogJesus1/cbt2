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
| `src/index.css` | Tailwind base + CSS variable definitions + theme blocks |
| `src/lib/utils.js` | `cn()` helper (clsx + tailwind-merge) |
| `src/lib/vfs.js` | Virtual filesystem (localStorage) for rosters |
| `src/components/ui/` | shadcn/ui components (Button, Card, Badge, etc.) |
| `src/components/shared/` | `colors.js` (unified palette), `constants.jsx` (shared layout primitives) |
| `src/components/` | App-level components — Terminal, TerminalBlock, and all block renderers |
| `src/data/` | `themeRegistry.js` — theme definitions |
| `src/App.jsx` | Root shell — view routing, engine fetching, theme management |
| `src/main.jsx` | React entry point |
| `dist/` | Built output (created by `python main.py --build`) |

## API Routes (server.py)

| Method | Route | Returns |
|---|---|---|
| GET | `/api/engines` | All loaded engines + primary ID |
| GET | `/api/engines/{name}` | Single engine status |
| GET | `/api/engines/{name}/schema` | Engine query schema |
| POST | `/api/engines/{name}/query` | Query result (structured params) |
| POST | `/api/engines/{name}/exec` | Execute raw command string (primary endpoint for terminal) |
| GET | `/api/engines/{name}/commands` | All command tokens for autocomplete |
| GET | `/health` | Health check |
| GET | `/api/version` | App version |
| GET | `/{path}` | Static file serving (SPA fallback to index.html) |

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
python main.py --build    # esbuild + Tailwind CLI
python main.py            # serves dist/ as static files from FastAPI
```

App runs at `http://localhost:8000`.

## Adding UI Components

- shadcn components go in `src/components/ui/` — copy from shadcn docs, they're just files
- App-level components go in `src/components/`
- Never import from `data/` inside any component — all data goes through the API

## Adding a Result Type

Add a renderer branch to `TerminalBlock.jsx`'s result type switch.
Create a dedicated block component if the rendering logic is complex.
