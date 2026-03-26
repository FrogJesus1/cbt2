"""
Entry point.

Usage:
  python main.py            # start web server (default)
  python main.py --cli      # start interactive CLI
  python main.py --build    # build React app for production
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent
CONFIG_PATH = ROOT / "config.json"


def load_config() -> dict:
    with open(CONFIG_PATH) as f:
        return json.load(f)


def start_web(config: dict):
    import uvicorn
    from render.web.server import create_app

    app  = create_app(config)
    host = config["web"]["host"]
    port = config["web"]["port"]

    print(f"[server] Combat Terminal running at http://{host}:{port}")
    print(f"[server] Press Ctrl+C to stop.")
    uvicorn.run(app, host=host, port=port, log_level="warning")


def start_cli(config: dict):
    from render.cli.terminal import Terminal

    terminal = Terminal(config)
    terminal.run()


def build_frontend():
    """Build the React app using esbuild + Tailwind (works without rollup native binaries)."""
    web_dir  = ROOT / "render" / "web"
    dist_dir = web_dir / "dist"
    (dist_dir / "assets").mkdir(parents=True, exist_ok=True)

    ESBUILD    = web_dir / "node_modules/@esbuild/linux-arm64/bin/esbuild"
    TAILWIND   = web_dir / "node_modules/tailwindcss/lib/cli.js"
    BUILD_SCRIPT = web_dir / "build.mjs"

    # ── JS bundle via esbuild ──────────────────────────────────────────────
    print("[build] Bundling JS with esbuild...")
    subprocess.run(
        [str(ESBUILD),
         "src/main.jsx",
         "--bundle",
         f"--outfile=dist/assets/main.js",
         "--format=esm",
         "--jsx=automatic",
         "--define:process.env.NODE_ENV='\"production\"'",
         "--loader:.css=empty",
         "--alias:@=./src",
         "--alias:recharts=./src/recharts-mock.js",
         "--minify"],
        cwd=web_dir,
        check=True,
    )

    # ── CSS via Tailwind CLI ───────────────────────────────────────────────
    print("[build] Building CSS with Tailwind...")
    subprocess.run(
        ["node", str(TAILWIND),
         "-i", "src/index.css",
         "-o", "dist/assets/main.css",
         "--minify"],
        cwd=web_dir,
        check=True,
    )

    # ── index.html ────────────────────────────────────────────────────────
    print("[build] Writing dist/index.html...")
    index_src = (web_dir / "index.html").read_text()
    # Swap the Vite dev script tag for the production bundle references
    index_out = index_src.replace(
        '<script type="module" src="/src/main.jsx"></script>',
        '<link rel="stylesheet" href="/assets/main.css" />\n  </head>\n'
        '  <body>\n    <div id="root"></div>\n'
        '    <script type="module" src="/assets/main.js"></script>',
    )
    (dist_dir / "index.html").write_text(index_out)

    print("[build] Build complete → render/web/dist/")


def main():
    parser = argparse.ArgumentParser(description="Data Engine + Renderer")
    parser.add_argument("--cli",   action="store_true", help="Start interactive CLI")
    parser.add_argument("--build", action="store_true", help="Build React frontend")
    args = parser.parse_args()

    config = load_config()

    if args.build:
        build_frontend()
    elif args.cli:
        start_cli(config)
    else:
        start_web(config)


if __name__ == "__main__":
    main()
