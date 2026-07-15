"""Apply supabase/migrations/*.sql to Postgres, in filename order.

Keeps a ledger in public.schema_migrations so a migration runs once and only
once. The legacy files were written to be idempotent and re-runnable; the new
ones are too, but "idempotent" is a property you have to keep earning by hand
and a ledger is cheaper than remembering.

Usage (from the repo root):

    # one-time: put the pooler connection string in .env.local
    #   SUPABASE_DB_URL=postgres://postgres.xxx:PASSWORD@aws-0-...:6543/postgres

    uv run --with "psycopg[binary]" python scripts/migrate.py --status
    uv run --with "psycopg[binary]" python scripts/migrate.py --dry
    uv run --with "psycopg[binary]" python scripts/migrate.py --only 20260715_
    uv run --with "psycopg[binary]" python scripts/migrate.py
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = ROOT / "supabase" / "migrations"
ENV_FILE = ROOT / ".env.local"

LEDGER = """
create table if not exists public.schema_migrations (
  filename    text primary key,
  applied_at  timestamptz not null default now(),
  checksum    text
);
"""


def load_env() -> None:
    """Read .env.local into os.environ without clobbering real env vars.

    utf-8-sig, not utf-8: PowerShell's `Set-Content -Encoding utf8` writes a
    BOM, which otherwise turns the first key into "﻿NEXT_PUBLIC_..." and
    produces a "not set" error for a variable that is plainly right there.
    """
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def checksum(text: str) -> str:
    import hashlib

    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true", help="Show what would run; execute nothing.")
    ap.add_argument("--status", action="store_true", help="Show applied vs pending; execute nothing.")
    ap.add_argument("--only", help="Only consider files whose name starts with this prefix.")
    ap.add_argument(
        "--baseline",
        action="store_true",
        help=(
            "Record matching migrations as applied WITHOUT executing them. For adopting a "
            "database whose schema predates this ledger. Combine with --only."
        ),
    )
    args = ap.parse_args()

    load_env()

    files = sorted(MIGRATIONS.glob("*.sql"))
    if args.only:
        files = [f for f in files if f.name.startswith(args.only)]
    if not files:
        print(f"No migrations matched under {MIGRATIONS}")
        return 1

    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        print(
            "ERROR: SUPABASE_DB_URL is not set.\n\n"
            "Supabase dashboard -> Settings -> Database -> Connection string\n"
            "-> Transaction pooler. Add it to .env.local:\n\n"
            "  SUPABASE_DB_URL=postgres://postgres.xxx:PASSWORD@aws-0-...pooler.supabase.com:6543/postgres\n",
            file=sys.stderr,
        )
        return 1

    try:
        import psycopg
    except ImportError:
        print(
            'ERROR: psycopg missing. Run with:\n'
            '  uv run --with "psycopg[binary]" python scripts/migrate.py\n',
            file=sys.stderr,
        )
        return 1

    # autocommit: each migration is its own transaction. A failure stops the
    # run with everything before it already committed, which is what we want —
    # a half-applied *file* is possible, a half-applied *run* is recoverable by
    # fixing the file and re-running. DDL in Postgres is transactional, so the
    # failing file itself rolls back cleanly.
    with psycopg.connect(db_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(LEDGER)
            cur.execute("select filename from public.schema_migrations")
            applied = {r[0] for r in cur.fetchall()}

            pending = [f for f in files if f.name not in applied]

            if args.status or args.dry:
                print(f"Applied: {len(applied)}   Pending: {len(pending)}\n")
                for f in files:
                    mark = "APPLIED " if f.name in applied else "PENDING "
                    print(f"  {mark} {f.name}")
                if args.dry and pending:
                    print("\n--- SQL that would run ---")
                    for f in pending:
                        print(f"\n-- ==== {f.name} ====")
                        print(f.read_text(encoding="utf-8"))
                return 0

            if args.baseline:
                # Adopting an existing database: its schema already reflects these
                # files, so executing them would re-run real work (0004_bridge_backfill
                # rewrites live rows). Record them as history instead.
                if not pending:
                    print("Nothing to baseline — all matching migrations already ledgered.")
                    return 0
                print("Recording as applied WITHOUT executing:\n")
                for f in pending:
                    cur.execute(
                        "insert into public.schema_migrations(filename, checksum) values (%s, %s) "
                        "on conflict (filename) do nothing",
                        (f.name, checksum(f.read_text(encoding="utf-8"))),
                    )
                    print(f"  baselined  {f.name}")
                print(f"\n{len(pending)} migration(s) baselined. Nothing was executed.")
                return 0

            if not pending:
                print("Nothing to do — all migrations already applied.")
                return 0

            for f in pending:
                sql = f.read_text(encoding="utf-8")
                print(f"Applying {f.name} ... ", end="", flush=True)
                try:
                    cur.execute(sql)
                except Exception as e:
                    print("FAILED")
                    print(f"\n{type(e).__name__}: {e}\n", file=sys.stderr)
                    print(
                        f"Stopped at {f.name}. Files before it are applied and ledgered;\n"
                        f"fix this file and re-run — it will resume from here.",
                        file=sys.stderr,
                    )
                    return 1
                cur.execute(
                    "insert into public.schema_migrations(filename, checksum) values (%s, %s) "
                    "on conflict (filename) do nothing",
                    (f.name, checksum(sql)),
                )
                print("OK")

    print(f"\nDone. {len(pending)} migration(s) applied.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
