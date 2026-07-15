"""Create a per-user dialer webhook endpoint.

Each user gets their own URL + secret, so a leaked key is revocable in
isolation and every inbound event is attributable to one workspace.

The secret is shown ONCE, here, and only its SHA-256 is stored. If it is lost,
rotate rather than recover -- there is nothing to recover from.

Usage:
    uv run --with "psycopg[binary]" python scripts/create_webhook_endpoint.py --list
    uv run --with "psycopg[binary]" python scripts/create_webhook_endpoint.py --org <uuid> --label "Readymode - main floor"
    uv run --with "psycopg[binary]" python scripts/create_webhook_endpoint.py --rotate <endpoint-uuid>
"""
from __future__ import annotations

import argparse
import hashlib
import os
import pathlib
import secrets
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.local"
APP_ORIGIN = "https://realtrack.app"


def load_env() -> None:
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v


def sha256hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def new_slug() -> str:
    # Public path segment. Deliberately NOT a uuid we use internally --
    # never reuse an internal identifier as a public one.
    return secrets.token_hex(6)


def new_secret() -> str:
    return secrets.token_urlsafe(32)


def banner(url: str, secret: str) -> None:
    print()
    print("=" * 72)
    print("  ENDPOINT CREATED — the secret is shown ONCE and is not recoverable")
    print("=" * 72)
    print()
    print("  Webhook URL:")
    print(f"    {url}")
    print()
    print("  Secret:")
    print(f"    {secret}")
    print()
    print("  Give Readymode ONE of these:")
    print()
    print("    Header auth (preferred):")
    print(f"      POST {url}")
    print(f"      Authorization: Bearer {secret}")
    print()
    print("    Query auth (for dialers that cannot set headers):")
    print(f"      POST {url}?secret={secret}")
    print()
    print("  Verify it is reachable (no secret needed):")
    print(f"    GET {url}   ->   200 {{'ok':true,...}}")
    print()
    print("=" * 72)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true", help="List orgs and existing endpoints.")
    ap.add_argument("--org", help="Organization uuid to create an endpoint for.")
    ap.add_argument("--label", default="Readymode dialer", help="Human label.")
    ap.add_argument("--rotate", help="Endpoint uuid: issue a new secret, keep the URL.")
    args = ap.parse_args()

    load_env()
    if not os.environ.get("SUPABASE_DB_URL"):
        print("ERROR: SUPABASE_DB_URL not set in .env.local", file=sys.stderr)
        return 1

    import psycopg

    with psycopg.connect(os.environ["SUPABASE_DB_URL"], autocommit=True) as conn:
        with conn.cursor() as cur:
            if args.list or not (args.org or args.rotate):
                cur.execute(
                    "select o.id, o.name, "
                    "  (select count(*) from public.profiles p where p.organization_id = o.id), "
                    "  (select count(*) from public.webhook_endpoints w where w.organization_id = o.id) "
                    "from public.organizations o order by o.created_at"
                )
                print(f"{'ORGANIZATION':<38} {'NAME':<22} {'USERS':>5} {'HOOKS':>5}")
                print("-" * 74)
                for oid, name, users, hooks in cur.fetchall():
                    print(f"{str(oid):<38} {(name or '')[:22]:<22} {users:>5} {hooks:>5}")

                cur.execute(
                    "select id, slug, label, is_active, secret_hint, last_seen_at, events_received "
                    "from public.webhook_endpoints order by created_at"
                )
                rows = cur.fetchall()
                print(f"\nEXISTING ENDPOINTS: {len(rows)}")
                for eid, slug, label, active, hint, seen, n in rows:
                    print(f"  {eid}  {APP_ORIGIN}/api/hook/{slug}")
                    print(f"      label={label!r} active={active} secret=...{hint} seen={seen} events={n}")
                if not (args.org or args.rotate):
                    print("\nPass --org <uuid> to create one.")
                return 0

            if args.rotate:
                secret = new_secret()
                cur.execute(
                    "update public.webhook_endpoints set secret_hash=%s, secret_hint=%s "
                    "where id=%s returning slug",
                    (sha256hex(secret), secret[-4:], args.rotate),
                )
                row = cur.fetchone()
                if not row:
                    print(f"ERROR: no endpoint {args.rotate}", file=sys.stderr)
                    return 1
                banner(f"{APP_ORIGIN}/api/hook/{row[0]}", secret)
                print("  The OLD secret stopped working the moment this ran.")
                return 0

            cur.execute("select name from public.organizations where id=%s", (args.org,))
            org = cur.fetchone()
            if not org:
                print(f"ERROR: no organization {args.org}", file=sys.stderr)
                return 1

            # Attach to a user in the org if there is one -- the endpoint is
            # per-user by design, but an org-level hook is valid too.
            cur.execute(
                "select id from public.profiles where organization_id=%s order by created_at limit 1",
                (args.org,),
            )
            owner = cur.fetchone()

            slug, secret = new_slug(), new_secret()
            cur.execute(
                "insert into public.webhook_endpoints "
                "(organization_id, owner_id, label, slug, secret_hash, secret_hint, provider) "
                "values (%s,%s,%s,%s,%s,%s,'readymode') returning id",
                (args.org, owner[0] if owner else None, args.label, slug, sha256hex(secret), secret[-4:]),
            )
            eid = cur.fetchone()[0]
            print(f"org: {org[0]}   endpoint: {eid}")
            banner(f"{APP_ORIGIN}/api/hook/{slug}", secret)
    return 0


if __name__ == "__main__":
    sys.exit(main())
