#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Generate songs_index.json from individual Bollywood song JSON files.

Usage:
  python scripts/generate_songs_index.py
  python scripts/generate_songs_index.py --songs-dir data/bollywood/songs --output data/bollywood/songs_index.json
  python scripts/generate_songs_index.py --strict

Behavior:
- Reads files matching bolly_*.json in the songs directory
- Extracts lightweight index fields from each file
- Sorts by numeric suffix (bolly_001, bolly_002, ...)
- Writes a unified songs_index.json
- Warns about missing expected IDs in the sequence
- Optionally fails on validation warnings with --strict
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

FILE_PATTERN = "bolly_*.json"
ID_RE = re.compile(r"^bolly_(\d{3})$")
REQUIRED_TOP_KEYS = [
    "id",
    "schema_version",
    "title",
    "film",
    "year",
    "singer",
    "lyricist",
    "composer",
    "notes",
    "tags",
    "key_phrase",
]

INDEX_KEYS = [
    "id",
    "title",
    "film",
    "year",
    "singer",
    "lyricist",
    "composer",
    "notes",
    "tags",
    "key_phrase",
    "status",
]


def load_json(path: Path) -> Dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        raise ValueError(f"{path.name}: invalid JSON ({e})") from e

    if not isinstance(data, dict):
        raise ValueError(f"{path.name}: top-level JSON must be an object")
    return data


def validate_song(data: Dict[str, Any], path: Path) -> List[str]:
    warnings: List[str] = []

    for key in REQUIRED_TOP_KEYS:
        if key not in data:
            warnings.append(f"{path.name}: missing required key '{key}'")

    song_id = data.get("id")
    if not isinstance(song_id, str) or not ID_RE.match(song_id):
        warnings.append(f"{path.name}: id must look like 'bolly_001'")

    if data.get("schema_version") != 2:
        warnings.append(f"{path.name}: schema_version is not 2")

    for list_key in ["singer", "lyricist", "composer", "notes", "tags"]:
        value = data.get(list_key)
        if value is not None and not isinstance(value, list):
            warnings.append(f"{path.name}: '{list_key}' should be a list")

    if "expressions" in data:
        exprs = data["expressions"]
        if not isinstance(exprs, list):
            warnings.append(f"{path.name}: 'expressions' should be a list")
        else:
            if not (3 <= len(exprs) <= 4):
                warnings.append(f"{path.name}: expressions count is {len(exprs)} (expected 3-4)")

    if "vocab_candidates" in data:
        vocab = data["vocab_candidates"]
        if not isinstance(vocab, list):
            warnings.append(f"{path.name}: 'vocab_candidates' should be a list")
        else:
            if not (10 <= len(vocab) <= 15):
                warnings.append(f"{path.name}: vocab_candidates count is {len(vocab)} (expected 10-15)")

            allowed_importance = {2, 3, 4}
            for i, item in enumerate(vocab, start=1):
                if not isinstance(item, dict):
                    warnings.append(f"{path.name}: vocab_candidates[{i}] is not an object")
                    continue
                importance = item.get("importance")
                if importance not in allowed_importance:
                    warnings.append(
                        f"{path.name}: vocab_candidates[{i}].importance={importance!r} "
                        f"(expected one of 2, 3, 4)"
                    )

    if "expressions" in data and isinstance(data["expressions"], list):
        allowed_importance = {2, 3, 4}
        for i, item in enumerate(data["expressions"], start=1):
            if not isinstance(item, dict):
                warnings.append(f"{path.name}: expressions[{i}] is not an object")
                continue
            importance = item.get("importance")
            if importance not in allowed_importance:
                warnings.append(
                    f"{path.name}: expressions[{i}].importance={importance!r} "
                    f"(expected one of 2, 3, 4)"
                )

    return warnings


def build_index_entry(data: Dict[str, Any]) -> Dict[str, Any]:
    entry: Dict[str, Any] = {key: data.get(key) for key in INDEX_KEYS if key != "status"}
    # Default status: processed when schema_version 2 files are being indexed
    entry["status"] = data.get("status", "processed")
    return entry


def song_sort_key(path: Path) -> Tuple[int, str]:
    m = ID_RE.match(path.stem)
    if m:
        return (int(m.group(1)), path.stem)
    return (10**9, path.stem)


def detect_missing_ids(entries: List[Dict[str, Any]]) -> List[str]:
    ids = []
    for entry in entries:
        song_id = entry.get("id")
        if isinstance(song_id, str):
            m = ID_RE.match(song_id)
            if m:
                ids.append(int(m.group(1)))

    if not ids:
        return []

    missing = []
    for n in range(min(ids), max(ids) + 1):
        if n not in ids:
            missing.append(f"bolly_{n:03d}")
    return missing


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--songs-dir",
        default="data/bollywood/songs",
        help="Directory containing bolly_*.json files",
    )
    parser.add_argument(
        "--output",
        default="data/bollywood/songs_index.json",
        help="Output path for songs_index.json",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit with error if any validation warnings are found",
    )
    args = parser.parse_args()

    songs_dir = Path(args.songs_dir)
    output_path = Path(args.output)

    if not songs_dir.exists():
        print(f"ERROR: songs directory not found: {songs_dir}", file=sys.stderr)
        return 1

    song_files = sorted(songs_dir.glob(FILE_PATTERN), key=song_sort_key)
    if not song_files:
        print(f"ERROR: no files matching {FILE_PATTERN} in {songs_dir}", file=sys.stderr)
        return 1

    all_warnings: List[str] = []
    index_entries: List[Dict[str, Any]] = []

    for path in song_files:
        try:
            data = load_json(path)
        except ValueError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1

        warnings = validate_song(data, path)
        all_warnings.extend(warnings)
        index_entries.append(build_index_entry(data))

    missing_ids = detect_missing_ids(index_entries)
    for missing in missing_ids:
        all_warnings.append(f"missing sequence id: {missing}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(index_entries, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Generated: {output_path}")
    print(f"Songs indexed: {len(index_entries)}")

    if all_warnings:
        print("\nWarnings:")
        for w in all_warnings:
            print(f"- {w}")

    if args.strict and all_warnings:
        print("\nStrict mode enabled: exiting with code 2 due to warnings.", file=sys.stderr)
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
