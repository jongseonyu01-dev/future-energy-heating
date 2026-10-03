#!/usr/bin/env python3
"""Verify the production mobile menu and its /branches navigation through local Chrome CDP."""

from __future__ import annotations

import base64
import json
import time
from pathlib import Path
from urllib.request import urlopen

import websocket


CDP_LIST_URL = "http://127.0.0.1:9223/json/list"
OUTPUT = Path("/home/ubuntu/future-energy-heating/evidence/screenshots/branch-status-mobile-menu-open-20260915.png")


def cdp(ws: websocket.WebSocket, message_id: int, method: str, params: dict | None = None) -> tuple[int, dict]:
    ws.send(json.dumps({"id": message_id, "method": method, "params": params or {}}))
    while True:
        response = json.loads(ws.recv())
        if response.get("id") == message_id:
            if "error" in response:
                raise RuntimeError(f"CDP {method} failed: {response['error']}")
            return message_id + 1, response.get("result", {})


def main() -> None:
    targets = json.loads(urlopen(CDP_LIST_URL, timeout=10).read().decode("utf-8"))
    page = next((target for target in targets if target.get("type") == "page"), None)
    if not page:
        raise RuntimeError("No Chrome page target is available.")

    ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=15, origin="http://localhost")
    message_id = 1
    try:
        message_id, _ = cdp(ws, message_id, "Emulation.setDeviceMetricsOverride", {
            "width": 390,
            "height": 844,
            "deviceScaleFactor": 1,
            "mobile": True,
        })
        message_id, _ = cdp(ws, message_id, "Page.navigate", {
            "url": "https://xn--h50b270bp0ceuddugnobx2m.kr/",
        })
        time.sleep(3)
        message_id, result = cdp(ws, message_id, "Runtime.evaluate", {
            "returnByValue": True,
            "expression": """
              (() => {
                const button = document.querySelector('.hamburger');
                const link = document.querySelector('#mobileNav a[href=\"/branches\"]');
                if (!button || !link) throw new Error('mobile menu controls missing');
                button.click();
                return {
                  page: location.href,
                  open: document.getElementById('mobileNav').classList.contains('open'),
                  displayed: getComputedStyle(document.getElementById('mobileNav')).display,
                  branchHref: link.getAttribute('href'),
                  branchLabel: link.textContent.trim(),
                  driverLinkPresent: Boolean(document.querySelector('#mobileNav a[href=\"/app/driver-download\"]')),
                };
              })()
            """,
        })
        menu_state = result["result"]["value"]
        message_id, screenshot = cdp(ws, message_id, "Page.captureScreenshot", {"format": "png"})
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_bytes(base64.b64decode(screenshot["data"]))
        message_id, _ = cdp(ws, message_id, "Runtime.evaluate", {
            "returnByValue": True,
            "expression": "document.querySelector('#mobileNav a[href=\"/branches\"]').click(); 'clicked'",
        })
        time.sleep(2)
        message_id, result = cdp(ws, message_id, "Runtime.evaluate", {
            "returnByValue": True,
            "expression": "(() => ({url: location.href, title: document.title, cardCount: document.querySelectorAll('[data-public-branch-id=\"honam\"]').length, phoneHref: document.querySelector('.call-button')?.getAttribute('href') ?? null}))()",
        })
        destination_state = result["result"]["value"]
    finally:
        ws.close()

    if menu_state != {
        "page": "https://xn--h50b270bp0ceuddugnobx2m.kr/",
        "open": True,
        "displayed": "block",
        "branchHref": "/branches",
        "branchLabel": "📍 지사 현황",
        "driverLinkPresent": True,
    }:
        raise AssertionError(f"Unexpected mobile menu state: {menu_state}")
    if destination_state != {
        "url": "https://xn--h50b270bp0ceuddugnobx2m.kr/branches",
        "title": "지사 현황 | 퓨처에너지테크",
        "cardCount": 1,
        "phoneHref": "tel:010-3241-5533",
    }:
        raise AssertionError(f"Unexpected destination state: {destination_state}")

    print(json.dumps({"mobile_menu": menu_state, "destination": destination_state, "screenshot": str(OUTPUT)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
