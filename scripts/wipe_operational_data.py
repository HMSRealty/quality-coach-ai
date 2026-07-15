"""Delete RealTrack's operational data for a clean-slate rebuild.

SCOPE (confirmed with the owner 2026-07-15):

  DELETED   leads, call_uploads (+ the mp3 objects in Supabase storage),
            calls, lead_events, lead_status_history, agent_scorecards,
            dialer_hours, campaigns, and the v2 tables if they hold anything.

  KEPT      organizations, profiles, auth.users, api_keys, roles,
            role_permissions, teams, team_members.

  NEVER TOUCHED
            Anything inside Readymode. This script only ever talks to
            Supabase. Your dialer's own leads and lists are not ours to
            delete and this script cannot reach them.

This is IRREVERSIBLE. There is no undo, and the mp3 objects are not
recoverable once removed from the bucket. It therefore defaults to a dry run
and refuses to delete without --confirm.

Usage:
    uv run --with "psycopg[binary]" --with httpx python scripts/wipe_operational_data.py
    uv run --with "psycopg[binary]" --with httpx python scripts/wipe_operational_data.py --confirm
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.local"

# Order matters: children before parents, so FKs never block a delete.
TABLES = [
    "lead_status_history",
    "lead_events",
    "call_uploads",
    "calls",
    "agent_scorecards",
    "dialer_hours",
    "leads",
    "campaigns",
]

# v2 tables — empty on a fresh pivot, but included so a re-run after partial
# ingest still yields a clean slate.
V2_TABLES = [
    "lead_calls",
    "lead_scores",
    "leads_v2",
    "call_metrics",
    "call_analyses",
    "transcripts",
    "recordings",
    "calls_v2",
    "action_plan_events",
    "action_plans",
    "alerts",
    "feed_events",
    "knowledge_facts",
    "coaching_notes",
    "agent_day_stats",
    "team_day_stats",
    "campaign_day_stats",
    "org_day_stats",
    "goals",
    "campaign_aliases",
    "campaigns_v2",
    "agent_identities",
    "jobs",
    "ingest_events",
]

KEEP = ["organizations", "profiles", "api_keys", "roles", "role_permissions", "teams", "team_members"]

BUCKET = "call-recordings"


def load_env() -> None:
    # utf-8-sig: strips a BOM if one is present. PowerShell's
    # `Set-Content -Encoding utf8` writes one, which silently corrupts the
    # first key in the file.
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


def table_exists(cur, name: str) -> bool:
    cur.execute("select to_regclass(%s)", (f"public.{name}",))
    return cur.fetchone()[0] is not None


def count(cur, name: str) -> int:
    cur.execute(f"select count(*) from public.{name}")
    return cur.fetchone()[0]


def list_storage_objects(url: str, key: str, bucket: str) -> list[str]:
    """Walk the bucket. Supabase's list endpoint is per-prefix and non-recursive,
    so we descend explicitly. Objects have no 'id' metadata; folders do not."""
    import httpx

    found: list[str] = []
    stack = [""]
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    with httpx.Client(timeout=30.0) as c:
        while stack:
            prefix = stack.pop()
            offset = 0
            while True:
                r = c.post(
                    f"{url}/storage/v1/object/list/{bucket}",
                    headers=headers,
                    json={"prefix": prefix, "limit": 100, "offset": offset},
                )
                if r.status_code != 200:
                    print(f"  storage list failed for '{prefix}': {r.status_code} {r.text[:200]}")
                    break
                items = r.json()
                if not items:
                    break
                for it in items:
                    name = it.get("name")
                    if not name:
                        continue
                    full = f"{prefix}/{name}" if prefix else name
                    # A folder placeholder has no id.
                    if it.get("id") is None:
                        stack.append(full)
                    else:
                        found.append(full)
                if len(items) < 100:
                    break
                offset += 100
    return found


def delete_storage_objects(url: str, key: str, bucket: str, paths: list[str]) -> int:
    import httpx

    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    deleted = 0
    with httpx.Client(timeout=60.0) as c:
        for i in range(0, len(paths), 100):
            batch = paths[i : i + 100]
            r = c.request(
                "DELETE",
                f"{url}/storage/v1/object/{bucket}",
                headers=headers,
                json={"prefixes": batch},
            )
            if r.status_code == 200:
                deleted += len(batch)
            else:
                print(f"  storage delete failed: {r.status_code} {r.text[:200]}")
    return deleted


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--confirm", action="store_true", help="Actually delete. Without this, dry run.")
    ap.add_argument("--keep-storage", action="store_true", help="Delete DB rows but keep the mp3 files.")
    args = ap.parse_args()

    load_env()
    db_url = os.environ.get("SUPABASE_DB_URL")
    sb_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not db_url:
        print("ERROR: SUPABASE_DB_URL not set in .env.local", file=sys.stderr)
        return 1
    if not sb_url or not sb_key:
        print("ERROR: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set", file=sys.stderr)
        return 1

    import psycopg

    print("=" * 68)
    print("DRY RUN — nothing will be deleted." if not args.confirm else "!!! LIVE RUN — DELETING DATA !!!")
    print("=" * 68)
    print()

    with psycopg.connect(db_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            print("WILL DELETE:")
            total = 0
            present: list[str] = []
            for t in TABLES + V2_TABLES:
                if not table_exists(cur, t):
                    continue
                n = count(cur, t)
                present.append(t)
                if n:
                    print(f"  {t:<26} {n:>7} rows")
                    total += n
            print(f"  {'':<26} {'-' * 7}")
            print(f"  {'TOTAL':<26} {total:>7} rows")
            print()

            print("WILL KEEP:")
            for t in KEEP:
                if table_exists(cur, t):
                    print(f"  {t:<26} {count(cur, t):>7} rows")
            print()

            objects: list[str] = []
            if not args.keep_storage:
                print(f"Scanning storage bucket '{BUCKET}' ...")
                objects = list_storage_objects(sb_url, sb_key, BUCKET)
                print(f"  {len(objects)} object(s) found — these will be PERMANENTLY deleted.")
                for p in objects[:5]:
                    print(f"    {p}")
                if len(objects) > 5:
                    print(f"    ... and {len(objects) - 5} more")
                print()

            print("NEVER TOUCHED: anything inside Readymode.")
            print()

            if not args.confirm:
                print("Dry run complete. Re-run with --confirm to execute.")
                return 0

            # TRUNCATE ... CASCADE in one statement handles FK order for us and
            # is atomic: either the whole wipe lands or none of it does.
            print("Deleting rows ...")
            cur.execute(f"truncate table {', '.join('public.' + t for t in present)} cascade")
            print(f"  {total} rows deleted across {len(present)} tables.")

            if objects:
                print("Deleting storage objects ...")
                n = delete_storage_objects(sb_url, sb_key, BUCKET, objects)
                print(f"  {n}/{len(objects)} objects deleted.")

            print()
            print("VERIFY:")
            for t in present:
                n = count(cur, t)
                flag = "OK " if n == 0 else "!! "
                if n:
                    print(f"  {flag}{t:<26} {n:>7} rows remain")
            print("  all target tables empty." if all(count(cur, t) == 0 for t in present) else "  SOME TABLES NOT EMPTY")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
