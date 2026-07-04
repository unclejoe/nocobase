#!/usr/bin/env python3
"""
Replay all JSBlockModel dark-mode theme fixes against the NocoBase database.

WHY THIS EXISTS
---------------
NocoBase pages can embed user-authored "JS code blocks" (flowModels rows with
use='JSBlockModel'). Several of these blocks hardcoded light-mode hex colors
(#ffffff, #f0f0f0, #dbe7f3, #0f172a, ...) instead of using antd design tokens
(theme.useToken()). In dark / compact-dark themes those cards rendered as solid
white blocks with unreadable text.

This script restores the fixed (token-based) JS source for every affected node
from a code snapshot taken after the fixes were applied, so the fixes survive a
database restore from a backup made *before* the fixes. It is IDEMPOTENT: nodes
that already contain 'useToken' are skipped.

WHAT IT TOUCHES
---------------
Only the `flowModels` table:
  options.stepParams.jsSettings.runJs.code  (the JS source string)
It never touches source files, migrations, or schema.

USAGE
-----
  PGPASSWORD=nocobase python3 scripts/theme-replay/replay-jsblock-darkmode-fixes.py

Connects to localhost:5432, database `nocobase`, user `nocobase` by default.
Override via standard libpq env vars (PGHOST, PGPORT, PGUSER, PGDATABASE,
PGPASSWORD).

COVERAGE
--------
Restores fixed code for these JSBlockModel families (by component name):
  - OverdueTicketPanel
  - MiniCard
  - PagedListPanel
  - LeadLifecycleCard / QuotationLifecycleCard / OrderWorkflowCard
  - QuotationDetailPreview / OrderDetailPreview
  - QuotationConfigurator (Add quotation page)
  - Quotation + Orders + Invoices table summary (TableBlockModel runJs renderers)
  - Projects table summary (status / priority / budget / progress renderer)
  - Project header + Milestone timeline (HeaderSurface / MilestoneSurface wrappers)
  - Orders Guide panel (Orders execution and finance guide)

The source-level fixes (plugin-comments cssinjs + Markdown Vditor theme) are
NOT replayed here — those live in git (commits 37387829cb, fea0e28885) and
travel with the codebase, not the database.

CAVEAT
------
The snapshot is keyed by node uid. If a page is rebuilt from scratch (new uids),
the snapshot won't match — but then the new JS would be authored fresh and
should follow the token-based convention documented in
docs/dark-mode-theme-guidelines.md. For nodes that still exist with the same
uid after a DB restore, this script restores the fixed code verbatim.
"""
import json
import os
import subprocess
import sys

PGHOST = os.environ.get("PGHOST", "localhost")
PGPORT = os.environ.get("PGPORT", "5432")
PGUSER = os.environ.get("PGUSER", "nocobase")
PGDATABASE = os.environ.get("PGDATABASE", "nocobase")
ENV = {**os.environ, "PGPASSWORD": os.environ.get("PGPASSWORD", "nocobase")}
PSQL = ["psql", "-h", PGHOST, "-p", PGPORT, "-U", PGUSER, "-d", PGDATABASE]

SNAPSHOT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "fixed-jsblock-code.json")


def psql(sql):
    res = subprocess.run(PSQL + ["-tA", "-v", "ON_ERROR_STOP=1"],
                         input=sql, capture_output=True, text=True, env=ENV)
    if res.returncode != 0:
        raise RuntimeError(f"psql failed: {res.stderr or res.stdout}")
    return res.stdout


def update_node(uid, new_code):
    options = json.loads(psql(f"SELECT options FROM \"flowModels\" WHERE uid = '{uid}';").strip())
    options["stepParams"]["jsSettings"]["runJs"]["code"] = new_code
    new_options_str = json.dumps(options)
    psql('UPDATE "flowModels" SET options = $nb_json_val$'
         + new_options_str + "$nb_json_val$::json WHERE uid = '" + uid + "';\n")


def update_flow_registry_node(uid, flow_key, new_code):
    """Update a runJs code block that lives under
    options.flowRegistry.<flow_key>.steps.runJs.defaultParams.code
    (used by TableBlockModel summary renderers, etc.)."""
    options = json.loads(psql(f"SELECT options FROM \"flowModels\" WHERE uid = '{uid}';").strip())
    options["flowRegistry"][flow_key]["steps"]["runJs"]["defaultParams"]["code"] = new_code
    new_options_str = json.dumps(options)
    psql('UPDATE "flowModels" SET options = $nb_json_val$'
         + new_options_str + "$nb_json_val$::json WHERE uid = '" + uid + "';\n")


def main():
    if not os.path.exists(SNAPSHOT_PATH):
        print(f"ERROR: snapshot not found at {SNAPSHOT_PATH}", file=sys.stderr)
        print("The fixed-code snapshot ships with this script.", file=sys.stderr)
        sys.exit(1)

    with open(SNAPSHOT_PATH) as f:
        snapshot = json.load(f)

    print(f"Replay JSBlockModel dark-mode fixes against {PGDATABASE}@{PGHOST}:{PGPORT}")
    print(f"  Snapshot: {len(snapshot)} fixed nodes\n")

    changed = 0
    skipped_fixed = 0
    skipped_missing = 0
    for entry in snapshot:
        uid = entry["uid"]
        fixed_code = entry["code"]
        path = entry.get("path")
        flow_key = entry.get("flowKey")
        try:
            if path == "flowRegistry":
                current = psql(
                    f"SELECT options->'flowRegistry'->'{flow_key}'->'steps'->'runJs'->'defaultParams'->>'code' "
                    f"FROM \"flowModels\" WHERE uid = '{uid}';"
                ).rstrip("\n")
            else:
                current = psql(
                    f"SELECT options->'stepParams'->'jsSettings'->'runJs'->>'code' "
                    f"FROM \"flowModels\" WHERE uid = '{uid}';"
                ).rstrip("\n")
        except RuntimeError:
            skipped_missing += 1
            continue
        if not current:
            skipped_missing += 1
            continue
        if "useToken" in current:
            skipped_fixed += 1
            continue
        try:
            if path == "flowRegistry":
                update_flow_registry_node(uid, flow_key, fixed_code)
            else:
                update_node(uid, fixed_code)
            changed += 1
        except Exception as e:
            print(f"  {uid}: FAILED {e}", file=sys.stderr)

    print(f"\nDone. Restored: {changed}, already-fixed: {skipped_fixed}, missing uid: {skipped_missing}")


if __name__ == "__main__":
    main()
