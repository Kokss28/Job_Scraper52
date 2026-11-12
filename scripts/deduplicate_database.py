import os
import sys
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv(".env.local")
load_dotenv(".env")

from supabase import create_client

url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Error: Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL")
    sys.exit(1)

supabase = create_client(url, key)

print("=" * 60)
print("SUPABASE DATABASE DEDUPLICATION SCRIPT")
print("=" * 60)

# 1. Fetch all jobs
chunk_size = 1000
all_rows = []
page = 0
print("[1/4] Fetching all records from 'jobs' table...")
while True:
    res = supabase.table("jobs").select("job_id, title, company, city, collected_at").range(page * chunk_size, (page + 1) * chunk_size - 1).execute()
    data = res.data or []
    all_rows.extend(data)
    if len(data) < chunk_size:
        break
    page += 1

initial_total = len(all_rows)
print(f"      Total records currently in database: {initial_total}")

# 2. Group by normalized title, company, city
groups = defaultdict(list)
for r in all_rows:
    t = (r.get("title") or "").strip().lower()
    c = (r.get("company") or "").strip().lower()
    ct = (r.get("city") or "").strip().lower()
    k = (t, c, ct)
    groups[k].append(r)

dup_groups = {k: v for k, v in groups.items() if len(v) > 1}
total_redundant = sum(len(v) - 1 for v in dup_groups.values())

print(f"[2/4] Identified {len(dup_groups)} duplicate groups containing {total_redundant} redundant rows.")

if total_redundant == 0:
    print("Database is already completely deduplicated! No deletions needed.")
    sys.exit(0)

to_delete_ids = []

for k, records in dup_groups.items():
    # Sort descending by collected_at (newest first). Null timestamps placed last.
    sorted_records = sorted(
        records,
        key=lambda x: (x.get("collected_at") or "", x.get("job_id") or ""),
        reverse=True
    )
    # The first row is the newest; keep it
    keeper = sorted_records[0]
    # The remaining rows are redundant duplicates
    for dup in sorted_records[1:]:
        to_delete_ids.append(dup["job_id"])

print(f"[3/4] Purging {len(to_delete_ids)} redundant duplicate records from Supabase...")

# 3. Batch delete in chunks of 100
batch_size = 100
deleted_count = 0

for i in range(0, len(to_delete_ids), batch_size):
    batch = to_delete_ids[i:i + batch_size]
    try:
        supabase.table("jobs").delete().in_("job_id", batch).execute()
        deleted_count += len(batch)
        print(f"      Deleted {deleted_count} / {len(to_delete_ids)} records...")
    except Exception as e:
        print(f"      Error deleting batch starting at index {i}: {e}")

print(f"      Completed deletion of {deleted_count} redundant records.")

# 4. Post-verification
print("[4/4] Verifying post-deduplication database integrity...")
all_rows_after = []
page = 0
while True:
    res = supabase.table("jobs").select("job_id, title, company, city, collected_at").range(page * chunk_size, (page + 1) * chunk_size - 1).execute()
    data = res.data or []
    all_rows_after.extend(data)
    if len(data) < chunk_size:
        break
    page += 1

final_total = len(all_rows_after)
print(f"      Final records in database: {final_total} (Expected: {initial_total - deleted_count})")

# Check remaining duplicates
post_groups = defaultdict(list)
for r in all_rows_after:
    t = (r.get("title") or "").strip().lower()
    c = (r.get("company") or "").strip().lower()
    ct = (r.get("city") or "").strip().lower()
    k = (t, c, ct)
    post_groups[k].append(r)

remaining_dups = {k: v for k, v in post_groups.items() if len(v) > 1}
if len(remaining_dups) == 0:
    print("      SUCCESS: 0 duplicate groups remain. Database is 100% deduplicated!")
else:
    print(f"      WARNING: {len(remaining_dups)} duplicate groups still detected.")

print("=" * 60)
