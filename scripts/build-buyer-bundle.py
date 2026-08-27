#!/usr/bin/env python3
"""Build a history-free, seller-neutral KârKalkan source bundle.

The bundle intentionally excludes Git history, local provider metadata, real
.env files, generated artifacts and local key/certificate material. It also
runs conservative text scans before writing the ZIP.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
BUNDLE_DIR = DIST / "karkalkan-buyer-source"
ZIP_PATH = DIST / "karkalkan-buyer-source.zip"

EXCLUDED_DIRS = {
    ".git",
    ".vercel",
    ".supabase",
    "node_modules",
    "dist",
    "buyer-bundle",
    "coverage",
    ".idea",
    ".vscode",
    "__pycache__",
}

EXCLUDED_NAMES = {".DS_Store", "Thumbs.db"}
EXCLUDED_KEY_EXTENSIONS = {".pem", ".key", ".p12", ".pfx", ".crt", ".cer"}
TEXT_EXTENSIONS = {
    ".md", ".txt", ".json", ".toml", ".yml", ".yaml", ".html", ".css",
    ".js", ".mjs", ".ts", ".tsx", ".jsx", ".sql", ".py", ".sh",
}

# These patterns look for actual-looking credentials/identity metadata, not
# documented placeholder prefixes such as `kk_live_...` or `REPLACE_ME`.
FORBIDDEN_PATTERNS = {
    "private key material": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "GitHub token": re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b"),
    "OpenAI-style secret": re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
    "Supabase secret key": re.compile(r"\bsb_secret_[A-Za-z0-9_-]{20,}\b"),
    "Paddle secret": re.compile(r"\bpdl_(?:live|sdbx)_[A-Za-z0-9_-]{20,}\b"),
    "KârKalkan developer API secret": re.compile(r"\bkk_live_[A-Za-z0-9_-]{20,}\b"),
    "webhook signing secret": re.compile(r"\bwhsec_[A-Za-z0-9_-]{20,}\b"),
    "personal email provider address": re.compile(
        r"\b[A-Z0-9._%+-]+@(?:gmail|hotmail|outlook|yahoo|icloud)\.[A-Z]{2,}\b", re.I
    ),
    "seller-owned GitHub repository URL": re.compile(r"https://github\.com/[^/\s]+/karkalkan(?:\b|/)", re.I),
    "generated Vercel team alias": re.compile(
        r"https://[a-z0-9-]+-(?:git-[a-z0-9-]+-)?[a-z0-9-]+-projects\.vercel\.app", re.I
    ),
    "Vercel team/project identifier": re.compile(r"\b(?:team|prj)_[A-Za-z0-9]{12,}\b"),
}


def should_include(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    if any(part in EXCLUDED_DIRS for part in rel.parts[:-1]):
        return False
    if path.name in EXCLUDED_NAMES:
        return False
    if path.name.startswith(".env") and path.name != ".env.example":
        return False
    if path.suffix.lower() in EXCLUDED_KEY_EXTENSIONS:
        return False
    return path.is_file()


def iter_source_files() -> list[Path]:
    files: list[Path] = []
    for path in ROOT.rglob("*"):
        if should_include(path):
            files.append(path)
    return sorted(files, key=lambda item: item.as_posix())


def scan_text(path: Path, denylist: list[str]) -> list[str]:
    if path.suffix.lower() not in TEXT_EXTENSIONS and path.name not in {".env.example", ".gitignore"}:
        return []
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return []

    issues: list[str] = []
    for label, pattern in FORBIDDEN_PATTERNS.items():
        if pattern.search(text):
            issues.append(label)
    lowered = text.casefold()
    for item in denylist:
        if item.casefold() in lowered:
            issues.append("SALE_PII_DENYLIST match")
            break
    return issues


def scan(files: list[Path]) -> list[str]:
    raw_denylist = os.getenv("SALE_PII_DENYLIST", "")
    denylist = [item.strip() for item in raw_denylist.split(";") if item.strip()]
    failures: list[str] = []
    for path in files:
        issues = scan_text(path, denylist)
        if issues:
            rel = path.relative_to(ROOT).as_posix()
            failures.append(f"{rel}: {', '.join(sorted(set(issues)))}")
    return failures


def build(files: list[Path]) -> None:
    shutil.rmtree(BUNDLE_DIR, ignore_errors=True)
    DIST.mkdir(parents=True, exist_ok=True)
    BUNDLE_DIR.mkdir(parents=True, exist_ok=True)

    copied: list[str] = []
    for source in files:
        rel = source.relative_to(ROOT)
        destination = BUNDLE_DIR / rel
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        copied.append(rel.as_posix())

    manifest = {
        "product": "KârKalkan",
        "bundle_type": "history-free-source-snapshot",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "file_count": len(copied),
        "excluded": [
            ".git history and commit metadata",
            ".vercel/.supabase local provider metadata",
            "real .env files",
            "local key/certificate files",
            "dependencies and generated build artifacts",
        ],
    }
    (BUNDLE_DIR / "BUYER_BUNDLE_MANIFEST.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    ZIP_PATH.unlink(missing_ok=True)
    with ZipFile(ZIP_PATH, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(BUNDLE_DIR.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(BUNDLE_DIR).as_posix())

    print(f"Buyer bundle created: {ZIP_PATH}")
    print(f"Files: {len(copied)} + BUYER_BUNDLE_MANIFEST.json")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="run privacy/secret scans without creating the buyer ZIP",
    )
    args = parser.parse_args()

    files = iter_source_files()
    failures = scan(files)
    if failures:
        print("Pre-sale scan failed:", file=sys.stderr)
        for failure in failures:
            print(f" - {failure}", file=sys.stderr)
        return 1

    print(f"Pre-sale scan passed for {len(files)} files.")
    if not args.check_only:
        build(files)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
