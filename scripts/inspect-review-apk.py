#!/usr/bin/env python3
"""Emit a compact, non-secret manifest and signing summary for a review APK."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

from androguard.core.apk import APK


def certificate_hashes(apk: APK, scheme: str) -> list[str]:
    if scheme == "v1":
        certificates = [
            certificate.dump()
            for certificate in apk.get_certificates_v1()
            if certificate is not None
        ]
    else:
        getter = getattr(apk, f"get_certificates_der_{scheme}")
        certificates = getter()
    return sorted(hashlib.sha256(certificate).hexdigest() for certificate in certificates)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: inspect-review-apk.py <apk-path>", file=sys.stderr)
        return 64

    apk_path = Path(sys.argv[1])
    apk = APK(str(apk_path))
    result = {
        "file": apk_path.name,
        "sha256": hashlib.sha256(apk_path.read_bytes()).hexdigest(),
        "package": apk.get_package(),
        "versionName": apk.get_androidversion_name(),
        "versionCode": apk.get_androidversion_code(),
        "signing": {
            "v1": {
                "present": apk.is_signed_v1(),
                "certificateSha256": certificate_hashes(apk, "v1"),
            },
            "v2": {
                "present": apk.is_signed_v2(),
                "certificateSha256": certificate_hashes(apk, "v2"),
            },
            "v3": {
                "present": apk.is_signed_v3(),
                "certificateSha256": certificate_hashes(apk, "v3"),
            },
        },
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
