#!/usr/bin/env python3
"""Small threaded static file server for local development.

Python's stock `http.server` is single-threaded, so one hung keep-alive connection
(which a browser hard-reload can easily leave behind) blocks every later request and
the server appears to die. This threaded version avoids that, and disables caching so
edits always show up on reload.

    python3 tools/serve.py [port]
"""

import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".webmanifest": "application/manifest+json",
        ".json": "application/json",
        ".ics": "text/calendar",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Keep the console readable: only report anything that is not a success.
        status = args[1] if len(args) > 1 else ""
        if not str(status).startswith("2"):
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)
    ThreadingHTTPServer.allow_reuse_address = True
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=root))
    server.daemon_threads = True
    print(f"Serving {root}\n  http://127.0.0.1:{port}/\nPress Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()


if __name__ == "__main__":
    main()
