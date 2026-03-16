"""
VUTHIES 2026 Dashboard — Automated Sync from Survey Solutions

This script connects to the Survey Solutions server API, exports the latest
data, rebuilds the dashboard, and (optionally) pushes to GitHub Pages.

Usage:
  python sync.py                        # uses config.json
  python sync.py --config myconfig.json # custom config file
  python sync.py --push                 # also git commit & push after build

Environment variables (override config.json):
  SS_URL        Survey Solutions server URL
  SS_WORKSPACE  Workspace name (default: primary)
  SS_USER       API user (must have API account role)
  SS_PASSWORD   API user password
  GH_TOKEN      GitHub PAT for push (optional)
"""

import argparse
import io
import json
import os
import re
import sys
import time
import zipfile
from pathlib import Path
from urllib.parse import urljoin

import requests

# ---------------------------------------------------------------------------
#  Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).parent.resolve()
DEFAULT_CONFIG = SCRIPT_DIR / "config.json"

# Questionnaire details
QUESTIONNAIRE_VARIABLE = "VUTHIES_2026"

# Files we need from the export
REQUIRED_FILES = [
    f"{QUESTIONNAIRE_VARIABLE}.tab",
    "hm_basic.tab",
    "interview__diagnostics.tab",
    "interview__errors.tab",
    "interview__comments.tab",
    "interview__actions.tab",
]


def load_config(config_path):
    """Load config from JSON file, with env-var overrides."""
    cfg = {}
    if config_path and Path(config_path).exists():
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)

    # Environment variables take priority
    cfg["url"] = os.environ.get("SS_URL", cfg.get("url", "")).rstrip("/")
    cfg["workspace"] = os.environ.get("SS_WORKSPACE", cfg.get("workspace", "primary"))
    cfg["user"] = os.environ.get("SS_USER", cfg.get("user", ""))
    cfg["password"] = os.environ.get("SS_PASSWORD", cfg.get("password", ""))
    cfg["gh_token"] = os.environ.get("GH_TOKEN", cfg.get("gh_token", ""))
    cfg["gh_repo"] = cfg.get("gh_repo", "vbos-dashboards/HIES")
    cfg["questionnaire_id"] = cfg.get("questionnaire_id", "")

    if not cfg["url"]:
        sys.exit("ERROR: Survey Solutions URL not set. Set SS_URL or url in config.json")
    if not cfg["user"] or not cfg["password"]:
        sys.exit("ERROR: API credentials not set. Set SS_USER/SS_PASSWORD or in config.json")

    return cfg


# ---------------------------------------------------------------------------
#  Survey Solutions API helpers
# ---------------------------------------------------------------------------

class SurveyAPI:
    """Minimal Survey Solutions REST API client."""

    def __init__(self, base_url, workspace, user, password):
        self.base = f"{base_url}/{workspace}"
        self.session = requests.Session()
        self.session.auth = (user, password)
        self.session.headers["Accept"] = "application/json"

    def _url(self, path):
        return f"{self.base}/api/v2/{path}"

    def get(self, path, **kwargs):
        r = self.session.get(self._url(path), **kwargs)
        r.raise_for_status()
        return r

    def post(self, path, **kwargs):
        r = self.session.post(self._url(path), **kwargs)
        r.raise_for_status()
        return r

    def list_questionnaires(self):
        """List all questionnaires on the server."""
        r = self.get("questionnaires", params={"limit": 40})
        return r.json().get("Questionnaires", [])

    def find_questionnaire(self, variable_name=None, questionnaire_id=None):
        """Find the questionnaire by variable name or ID."""
        qs = self.list_questionnaires()
        for q in qs:
            if questionnaire_id and q.get("QuestionnaireId") == questionnaire_id:
                return q
            if variable_name and q.get("Variable", "").upper() == variable_name.upper():
                return q
        return None

    def start_export(self, questionnaire_identity):
        """Start a new Tab-separated export job. Returns job ID."""
        qid, ver = questionnaire_identity.split("$")
        payload = {
            "QuestionnaireId": qid,
            "ExportType": "Tabular",
            "InterviewStatus": "All",
        }
        r = self.post(f"export", json=payload)
        data = r.json()
        return data.get("JobId") or data.get("jobId")

    def get_export_status(self, job_id):
        """Check export job progress."""
        r = self.get(f"export/{job_id}")
        return r.json()

    def download_export(self, job_id):
        """Download the finished export as a ZIP file bytes."""
        r = self.get(f"export/{job_id}/file", stream=True)
        return r.content

    def wait_for_export(self, job_id, timeout=300, poll_interval=5):
        """Wait for export job to finish. Returns status dict."""
        print(f"  Waiting for export job {job_id}...")
        elapsed = 0
        while elapsed < timeout:
            status = self.get_export_status(job_id)
            progress = status.get("Progress", status.get("progress", 0))
            has_file = status.get("HasExportFile", status.get("hasExportFile", False))
            job_status = status.get("JobStatus", status.get("jobStatus", ""))

            print(f"  Progress: {progress}%  Status: {job_status}", end="\r")

            if has_file or job_status == "Completed":
                print(f"\n  Export completed!")
                return status

            if job_status in ("Fail", "Failed"):
                sys.exit(f"ERROR: Export job failed: {status}")

            time.sleep(poll_interval)
            elapsed += poll_interval

        sys.exit(f"ERROR: Export timed out after {timeout}s")


# ---------------------------------------------------------------------------
#  Data processing
# ---------------------------------------------------------------------------

def parse_tsv(text):
    """Parse tab-separated text into list of dicts."""
    lines = text.strip().split("\n")
    if len(lines) < 1:
        return []
    headers = lines[0].split("\t")
    rows = []
    for line in lines[1:]:
        vals = line.split("\t")
        row = {}
        for i, h in enumerate(headers):
            row[h.strip()] = vals[i].strip() if i < len(vals) else ""
        rows.append(row)
    return rows


def extract_data(zip_bytes):
    """Extract required .tab files from ZIP and return parsed data dict."""
    data = {}
    field_map = {
        f"{QUESTIONNAIRE_VARIABLE}.tab": "mainData",
        "hm_basic.tab": "memberData",
        "interview__diagnostics.tab": "diagData",
        "interview__errors.tab": "errorData",
        "interview__comments.tab": "commentData",
        "interview__actions.tab": "actionData",
    }

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        names = zf.namelist()
        print(f"  ZIP contains {len(names)} files")

        for filename, key in field_map.items():
            # Find the file (may be in a subdirectory)
            match = [n for n in names if n.endswith(filename)]
            if match:
                content = zf.read(match[0]).decode("utf-8-sig")
                parsed = parse_tsv(content)
                data[key] = parsed
                print(f"  {filename}: {len(parsed)} records")
            else:
                print(f"  WARNING: {filename} not found in export")
                data[key] = []

    return data


# ---------------------------------------------------------------------------
#  Dashboard build
# ---------------------------------------------------------------------------

def build_dashboard(data, dashboard_src, output_path):
    """Inject data into dashboard.html to produce self-contained index.html."""
    with open(dashboard_src, "r", encoding="utf-8") as f:
        html = f.read()

    json_data = json.dumps(data)

    # Find the LOAD DATA FILES marker
    idx_marker = html.find("LOAD DATA FILES")
    if idx_marker < 0:
        sys.exit("ERROR: Could not find 'LOAD DATA FILES' marker in dashboard.html")

    # Go back to the "// ====" line
    line_start = html.rfind("\n", 0, idx_marker) + 1
    prev_line_start = html.rfind("\n", 0, line_start - 1) + 1

    # Find end of Promise.all block
    last_load = html.rfind("loadFile(", idx_marker, idx_marker + 2000)
    bracket_end = html.find("]);", last_load)
    end_pos = bracket_end + 3

    replacement = (
        "        // ==========================================================\n"
        "        //  EMBEDDED DATA (auto-synced from Survey Solutions)\n"
        "        // ==========================================================\n"
        "        const EMBEDDED_DATA = "
        + json_data
        + ";\n\n"
        "        async function initDashboard() {\n"
        "            document.getElementById('lastUpdate').textContent = 'Loaded: ' + new Date().toLocaleString();\n"
        "\n"
        "            // Use embedded data\n"
        "            const mainData = EMBEDDED_DATA.mainData;\n"
        "            const memberData = EMBEDDED_DATA.memberData;\n"
        "            const diagData = EMBEDDED_DATA.diagData;\n"
        "            const errorData = EMBEDDED_DATA.errorData;\n"
        "            const commentData = EMBEDDED_DATA.commentData;\n"
        "            const actionData = EMBEDDED_DATA.actionData;\n"
    )

    new_html = html[:prev_line_start] + replacement + html[end_pos:]

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(new_html)

    size_kb = os.path.getsize(output_path) / 1024
    print(f"  Built {output_path} ({size_kb:.1f} KB)")


# ---------------------------------------------------------------------------
#  Git push
# ---------------------------------------------------------------------------

def git_push(repo_dir, gh_token, gh_repo, message="Auto-sync dashboard data"):
    """Commit and push index.html to GitHub."""
    import subprocess

    def run(cmd, **kwargs):
        return subprocess.run(cmd, cwd=repo_dir, capture_output=True, text=True, **kwargs)

    # Stage
    run(["git", "add", "index.html"])

    # Check if there are changes
    result = run(["git", "diff", "--cached", "--quiet"])
    if result.returncode == 0:
        print("  No changes to push — dashboard is up to date.")
        return

    # Commit
    run(["git", "commit", "-m", message])

    # Push with token
    push_url = f"https://{gh_token}@github.com/{gh_repo}.git"
    result = run(["git", "remote", "set-url", "origin", push_url])
    result = run(["git", "push"])
    # Reset remote to clean URL (remove token)
    run(["git", "remote", "set-url", "origin", f"https://github.com/{gh_repo}.git"])

    if result.returncode == 0:
        print(f"  Pushed to GitHub: https://github.com/{gh_repo}")
    else:
        print(f"  Push failed: {result.stderr}")


# ---------------------------------------------------------------------------
#  Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Sync VUTHIES dashboard from Survey Solutions")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG), help="Path to config.json")
    parser.add_argument("--push", action="store_true", help="Git push after building")
    parser.add_argument("--skip-export", action="store_true", help="Skip API export, use existing embedded_data.json")
    args = parser.parse_args()

    print("=" * 60)
    print("VUTHIES 2026 Dashboard — Auto Sync")
    print("=" * 60)

    cfg = load_config(args.config)
    dashboard_src = SCRIPT_DIR.parent / "VUTHIES_2026_1_Tabular_All_20260316T2058Z" / "dashboard.html"
    output_path = SCRIPT_DIR / "index.html"

    if args.skip_export:
        # Use existing embedded data
        data_file = SCRIPT_DIR.parent / "VUTHIES_2026_1_Tabular_All_20260316T2058Z" / "embedded_data.json"
        print(f"\n[1/3] Loading existing data from {data_file}")
        with open(data_file, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        # Connect to Survey Solutions
        print(f"\n[1/3] Connecting to Survey Solutions...")
        print(f"  Server: {cfg['url']}")
        print(f"  Workspace: {cfg['workspace']}")

        api = SurveyAPI(cfg["url"], cfg["workspace"], cfg["user"], cfg["password"])

        # Find questionnaire
        q = api.find_questionnaire(
            variable_name=QUESTIONNAIRE_VARIABLE,
            questionnaire_id=cfg.get("questionnaire_id"),
        )
        if not q:
            sys.exit(f"ERROR: Questionnaire '{QUESTIONNAIRE_VARIABLE}' not found on server")

        q_identity = q["QuestionnaireIdentity"]
        print(f"  Found: {q.get('Title', QUESTIONNAIRE_VARIABLE)} (v{q.get('Version', '?')})")
        print(f"  Identity: {q_identity}")

        # Start export
        print(f"\n[2/3] Requesting data export...")
        job_id = api.start_export(q_identity)
        api.wait_for_export(job_id)

        # Download
        print(f"  Downloading export...")
        zip_bytes = api.download_export(job_id)
        print(f"  Downloaded {len(zip_bytes) / 1024:.1f} KB")

        # Extract and parse
        data = extract_data(zip_bytes)

    # Build dashboard
    print(f"\n[3/3] Building dashboard...")
    build_dashboard(data, str(dashboard_src), str(output_path))

    # Push to GitHub
    if args.push:
        if not cfg.get("gh_token"):
            print("  WARNING: No GH_TOKEN set, skipping push")
        else:
            timestamp = time.strftime("%Y-%m-%d %H:%M")
            git_push(str(SCRIPT_DIR), cfg["gh_token"], cfg["gh_repo"],
                     message=f"Auto-sync: {timestamp}")

    print(f"\nDone!")


if __name__ == "__main__":
    main()
