"""
VUTHIES 2026 Dashboard — Build Script

Downloads the data export from Survey Solutions manually, then run:

    python build.py "C:\\Users\\jyaruel\\Downloads\\VUTHIES_2026_1_Tabular_All"

Or just double-click / run without arguments — it will look for the
latest VUTHIES export folder in your Downloads automatically.

After building, push to GitHub Pages with:
    python build.py --push
"""

import csv
import glob
import json
import os
import subprocess
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOADS = os.path.join(os.path.expanduser("~"), "Downloads")
QUESTIONNAIRE = "VUTHIES_2026"

# Lookup files (in Downloads)
VILLAGE_LOOKUP = os.path.join(DOWNLOADS, "Options-in-question-Q1.5. Please select village name or urban area..xlsx")
AREA_COUNCIL_CSV = os.path.join(DOWNLOADS, "Area_Council.csv")

# The .tab files we need
TAB_FILES = {
    f"{QUESTIONNAIRE}.tab": "mainData",
    "hm_basic.tab": "memberData",
    "interview__diagnostics.tab": "diagData",
    "interview__errors.tab": "errorData",
    "interview__comments.tab": "commentData",
    "interview__actions.tab": "actionData",
}


def parse_tsv(filepath):
    """Parse a tab-separated file into a list of dicts."""
    with open(filepath, "r", encoding="utf-8-sig") as f:
        text = f.read()
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


def find_export_folder():
    """Auto-detect the latest VUTHIES export folder in Downloads."""
    downloads = os.path.join(os.path.expanduser("~"), "Downloads")
    pattern = os.path.join(downloads, f"{QUESTIONNAIRE}_*_Tabular_*")
    folders = sorted(glob.glob(pattern), reverse=True)
    for f in folders:
        if os.path.isdir(f) and os.path.exists(os.path.join(f, f"{QUESTIONNAIRE}.tab")):
            return f
    return None


def load_lookups():
    """Load village and area council name lookups."""
    villages = {}
    area_councils = {}

    # Village names from Excel
    if os.path.exists(VILLAGE_LOOKUP):
        try:
            import openpyxl
            wb = openpyxl.load_workbook(VILLAGE_LOOKUP, read_only=True)
            ws = wb.active
            for row in ws.iter_rows(min_row=2, values_only=True):
                val, title = row[0], row[1]
                if val and title:
                    villages[str(val)] = str(title)
            wb.close()
            print(f"  Village lookup: {len(villages)} entries")
        except ImportError:
            print("  WARNING: openpyxl not installed — run: pip install openpyxl")
    else:
        print(f"  WARNING: Village lookup not found at {VILLAGE_LOOKUP}")

    # Area council names from CSV
    if os.path.exists(AREA_COUNCIL_CSV):
        with open(AREA_COUNCIL_CSV, "r", encoding="utf-8-sig") as f:
            reader = csv.reader(f)
            header = next(reader, None)
            for row in reader:
                if len(row) >= 2:
                    area_councils[row[0].strip()] = row[1].strip()
        print(f"  Area council lookup: {len(area_councils)} entries")
    else:
        print(f"  WARNING: Area council CSV not found at {AREA_COUNCIL_CSV}")

    return villages, area_councils


def load_data(src_dir):
    """Read all .tab files from the export folder."""
    data = {}
    for filename, key in TAB_FILES.items():
        filepath = os.path.join(src_dir, filename)
        if os.path.exists(filepath):
            rows = parse_tsv(filepath)
            data[key] = rows
            print(f"  {filename}: {len(rows)} records")
        else:
            print(f"  WARNING: {filename} not found")
            data[key] = []

    # Load and embed lookups
    villages, area_councils = load_lookups()
    data["villageLookup"] = villages
    data["areaCouncilLookup"] = area_councils

    return data


def build_html(data, src_dir):
    """Inject data into dashboard.html to create self-contained index.html."""
    dashboard_path = os.path.join(src_dir, "dashboard.html")
    if not os.path.exists(dashboard_path):
        sys.exit(f"ERROR: dashboard.html not found in {src_dir}")

    with open(dashboard_path, "r", encoding="utf-8") as f:
        html = f.read()

    json_data = json.dumps(data)

    # Find the LOAD DATA FILES marker
    idx_marker = html.find("LOAD DATA FILES")
    if idx_marker < 0:
        sys.exit("ERROR: Could not find 'LOAD DATA FILES' marker in dashboard.html")

    line_start = html.rfind("\n", 0, idx_marker) + 1
    prev_line_start = html.rfind("\n", 0, line_start - 1) + 1

    last_load = html.rfind("loadFile(", idx_marker, idx_marker + 2000)
    end_marker = html.find("// END_REPLACEABLE_BLOCK", last_load)
    if end_marker < 0:
        # Fallback for older dashboard versions
        bracket_end = html.find("]);", last_load)
        end_pos = bracket_end + 3
    else:
        end_pos = end_marker + len("// END_REPLACEABLE_BLOCK")

    replacement = (
        "        // ==========================================================\n"
        "        //  EMBEDDED DATA (built from Survey Solutions export)\n"
        "        // ==========================================================\n"
        "        const EMBEDDED_DATA = " + json_data + ";\n\n"
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
        "            const VILLAGE_LOOKUP = EMBEDDED_DATA.villageLookup || {};\n"
        "            const AC_LOOKUP = EMBEDDED_DATA.areaCouncilLookup || {};\n"
        "            function villageName(code) { return VILLAGE_LOOKUP[code] || code; }\n"
        "            function acName(code) { return AC_LOOKUP[code] || code; }\n"
    )

    new_html = html[:prev_line_start] + replacement + html[end_pos:]

    dest = os.path.join(SCRIPT_DIR, "index.html")
    with open(dest, "w", encoding="utf-8") as f:
        f.write(new_html)

    size_kb = os.path.getsize(dest) / 1024
    print(f"\n  Created {dest} ({size_kb:.1f} KB)")
    return dest


def git_push():
    """Commit and push index.html to GitHub."""
    def run(cmd):
        return subprocess.run(cmd, cwd=SCRIPT_DIR, capture_output=True, text=True)

    run(["git", "add", "index.html"])
    result = run(["git", "diff", "--cached", "--quiet"])
    if result.returncode == 0:
        print("  No changes — dashboard is already up to date.")
        return

    import time
    msg = f"Update dashboard data: {time.strftime('%Y-%m-%d %H:%M')}"
    run(["git", "commit", "-m", msg])
    result = run(["git", "push"])
    if result.returncode == 0:
        print("  Pushed to GitHub Pages!")
    else:
        print(f"  Push failed: {result.stderr}")
        print("  You can push manually: git push")


def main():
    print("=" * 50)
    print("VUTHIES 2026 Dashboard Builder")
    print("=" * 50)

    do_push = "--push" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]

    # Determine source folder
    if args:
        src_dir = args[0].strip('"').strip("'")
    else:
        src_dir = find_export_folder()
        if not src_dir:
            print("\nERROR: No export folder found.")
            print(f"Download the data from Survey Solutions, then run:")
            print(f'  python build.py "C:\\path\\to\\{QUESTIONNAIRE}_..._Tabular_All"')
            sys.exit(1)

    print(f"\n[1/2] Reading data from:\n  {src_dir}")
    if not os.path.isdir(src_dir):
        sys.exit(f"ERROR: Folder not found: {src_dir}")

    data = load_data(src_dir)

    print(f"\n[2/2] Building dashboard...")
    build_html(data, src_dir)

    if do_push:
        print(f"\n  Pushing to GitHub...")
        git_push()

    print("\nDone!")


if __name__ == "__main__":
    main()
