#!/usr/bin/env python3
"""One-time production APK release bridge.

The official-site browser owns the authenticated HQ token. This short-lived
bridge accepts only one trigger from that origin, keeps the token in process
memory, and uploads the already verified local APK to the official server.
It never writes the token or an Authorization header to files or logs.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import requests


OFFICIAL_ORIGIN = "https://xn--h50b270bp0ceuddugnobx2m.kr"
APK_SHA256 = "5cb1a2cf1274f450d923977a46ec0c7bbd9ba264b176e00f05731e331670b086"
VERSION_NAME = "1.1.42"
VERSION_CODE = 42
RELEASE_NOTES = "기사 자동견적 구성·수량 입력 가독성·현장 사진 모듈 안정성 보완"


class ReleaseState:
    def __init__(self, apk_path: Path) -> None:
        self.apk_path = apk_path
        self.lock = threading.Lock()
        self.value: dict[str, Any] = {"stage": "ready", "ok": None}

    def update(self, **kwargs: Any) -> None:
        with self.lock:
            self.value.update(kwargs)

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            return dict(self.value)


def digest_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def release_worker(state: ReleaseState, token: str) -> None:
    try:
        if digest_file(state.apk_path) != APK_SHA256:
            raise RuntimeError("LOCAL_SHA256_MISMATCH")
        state.update(stage="uploading", ok=None, verified_sha256=True)
        headers = {"Authorization": f"Bearer {token}"}
        with state.apk_path.open("rb") as apk_file:
            upload_response = requests.post(
                f"{OFFICIAL_ORIGIN}/api/mobile-app/upload-apk",
                headers=headers,
                files={"file": ("future-driver-1.1.42.apk", apk_file, "application/vnd.android.package-archive")},
                data={"versionName": VERSION_NAME, "versionCode": str(VERSION_CODE)},
                timeout=(30, 900),
            )
        upload_body = upload_response.json()
        if upload_response.status_code != HTTPStatus.OK or not upload_body.get("success"):
            raise RuntimeError(f"UPLOAD_HTTP_{upload_response.status_code}")
        apk_url = upload_body.get("apkUrl")
        if not isinstance(apk_url, str) or not apk_url:
            raise RuntimeError("UPLOAD_URL_MISSING")

        latest = requests.get(f"{OFFICIAL_ORIGIN}/api/mobile-app/latest", timeout=(30, 60))
        latest_body = latest.json() if latest.ok else {}
        min_supported = int(latest_body.get("minSupportedVersionCode") or 1)
        state.update(stage="registering", ok=None, apk_url=apk_url)
        payload = {
            "appId": "driver",
            "versionName": VERSION_NAME,
            "versionCode": VERSION_CODE,
            "minSupportedVersionCode": min_supported,
            "apkUrl": apk_url,
            "sha256": APK_SHA256,
            "fileSize": state.apk_path.stat().st_size,
            "releaseNotes": RELEASE_NOTES,
        }
        register_response = requests.post(
            f"{OFFICIAL_ORIGIN}/api/mobile-app/releases",
            headers={**headers, "Content-Type": "application/json"},
            json=payload,
            timeout=(30, 90),
        )
        register_body = register_response.json()
        if register_response.status_code != HTTPStatus.OK or not register_body.get("success"):
            raise RuntimeError(f"REGISTER_HTTP_{register_response.status_code}")
        state.update(
            stage="complete",
            ok=True,
            upload_status=upload_response.status_code,
            register_status=register_response.status_code,
            apk_url=apk_url,
            version_name=VERSION_NAME,
            version_code=VERSION_CODE,
            sha256=APK_SHA256,
            file_size=state.apk_path.stat().st_size,
            min_supported_version_code=min_supported,
        )
    except Exception as exc:  # sanitized in status output; no token included
        state.update(stage="failed", ok=False, error=str(exc))
    finally:
        token = ""  # drop the only in-memory reference


class Handler(BaseHTTPRequestHandler):
    state: ReleaseState

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", OFFICIAL_ORIGIN)
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Cache-Control", "no-store")

    def _json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/status":
            return self._json(HTTPStatus.OK, self.state.snapshot())
        return self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/trigger":
            return self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
        if self.headers.get("Origin") != OFFICIAL_ORIGIN:
            return self._json(HTTPStatus.FORBIDDEN, {"error": "origin_forbidden"})
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer ") or len(auth) <= len("Bearer "):
            return self._json(HTTPStatus.UNAUTHORIZED, {"error": "hq_auth_required"})
        current = self.state.snapshot()
        if current.get("stage") != "ready":
            return self._json(HTTPStatus.CONFLICT, current)
        self.state.update(stage="accepted", ok=None)
        worker = threading.Thread(target=release_worker, args=(self.state, auth), daemon=True)
        worker.start()
        return self._json(HTTPStatus.ACCEPTED, {"stage": "accepted", "ok": None})

    def log_message(self, _format: str, *_args: Any) -> None:
        # No request headers, URL query strings, or token values are logged.
        return


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apk", required=True)
    parser.add_argument("--port", type=int, default=8766)
    args = parser.parse_args()
    apk_path = Path(args.apk).resolve()
    if not apk_path.is_file():
        raise SystemExit(f"APK file not found: {apk_path}")
    if digest_file(apk_path) != APK_SHA256:
        raise SystemExit("APK SHA-256 does not match approved code 42 artifact")
    Handler.state = ReleaseState(apk_path)
    server = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    print(f"One-time release bridge ready on port {args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
