#!/usr/bin/env python3
"""Serve a single, already-verified APK for a short-lived browser upload bridge.

This is not an app runtime service and is intended only for the active release
operation. It serves files from the supplied directory with a restrictive CORS
header so the authenticated official-site browser page can fetch the APK and
post it to its own upload endpoint without exposing an administrator token.
"""

from __future__ import annotations

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class ApkHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "https://xn--h50b270bp0ceuddugnobx2m.kr")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", required=True)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    directory = Path(args.directory).resolve()
    if not directory.is_dir():
        raise SystemExit(f"not a directory: {directory}")

    def handler(*handler_args, **handler_kwargs):
        return ApkHandler(*handler_args, directory=str(directory), **handler_kwargs)

    server = ThreadingHTTPServer(("0.0.0.0", args.port), handler)
    print(f"Serving verified APK directory on port {args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
