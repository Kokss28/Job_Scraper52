"""
Live Scrape Runner CLI for Job Intelligence Web Portal.
Invoked by Next.js Scraper Studio to harvest real live jobs from LinkedIn, Naukri, and Indeed.
Enriches degrees, normalizes locations, updates SQLite database and Supabase.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import warnings
from datetime import datetime
import logging
from pathlib import Path

# Suppress sklearn unpickling warnings
warnings.filterwarnings("ignore")

# Configure utf-8 stdout
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Configure logging to write to stdout so Next.js doesn't treat INFO as stderr WARN
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    stream=sys.stdout,
    force=True,
)

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

# Default delays for gentle rate limiting
os.environ.setdefault("LINKEDIN_DELAY_MIN", "1.5")
os.environ.setdefault("LINKEDIN_DELAY_MAX", "3.0")

from config import OUTPUT_DIR, LINKEDIN_LOCATION, NAUKRI_MAX_PAGES, NAUKRI_HEADLESS
from database import import_csv_to_database, DB_PATH
from pipeline.orchestrator import run_pipeline
from pipeline.storage import JobStore
from scrapers.indeed.scraper import collect_indeed_jobs
from scrapers.linkedin.scraper import collect_linkedin_jobs
from scrapers.naukri.scraper import collect_naukri_jobs

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT_DIR / ".env")
except Exception:
    pass


def log(msg: str):
    timestamp = datetime.now().strftime("%H:%M:%S")
    line = f"[{timestamp}] {msg}"
    print(line, flush=True)


def parse_args():
    parser = argparse.ArgumentParser(description="Live Job Scraper Runner")
    parser.add_argument("--domain", type=str, default=None, help="Domain category name (e.g. 'Python Development', 'Data & Analytics')")
    parser.add_argument("--sources", type=str, default="LinkedIn,Naukri,Indeed", help="Comma-separated sources")
    parser.add_argument("--keywords", type=str, default="Python developer", help="Comma-separated keywords")
    parser.add_argument("--freshness", type=float, default=24.0, help="Manual time range in hours (e.g. 1, 6, 24, 72)")
    parser.add_argument("--location", type=str, default="India", help="Target search location (e.g. India, Bengaluru, Pune)")
    parser.add_argument("--max-jobs", type=int, default=None, help="Optional max jobs limit (omitted for unlimited)")
    parser.add_argument("--enable-details", dest="enable_details", action="store_true", default=True, help="Enable full detail page fetching for rich descriptions and education")
    parser.add_argument("--no-details", dest="enable_details", action="store_false", help="Disable detail page fetching for faster card-only scraping")
    parser.add_argument("--export-local-csv", dest="export_local_csv", action="store_true", default=False, help="Also export a local CSV backup in Data/ (defaults to False for cloud-native Supabase)")
    return parser.parse_args()


def main():
    args = parse_args()
    sources = [s.strip().lower() for s in args.sources.split(",") if s.strip()]
    keywords = [k.strip() for k in args.keywords.split(",") if k.strip()]
    freshness = max(0.1, float(args.freshness))
    location = args.location.strip() if getattr(args, "location", None) else "India"
    if not location:
        location = "India"
    max_jobs = args.max_jobs if (args.max_jobs is not None and args.max_jobs > 0) else None
    enable_details = bool(getattr(args, "enable_details", True))

    limit_desc = f"Max {max_jobs} jobs" if max_jobs else "All accessible matching jobs (Unlimited)"
    log(f"Initializing Live Scraper Engine...")
    log(f"Target Platforms: {', '.join([s.capitalize() for s in sources])}")
    log(f"Keywords ({len(keywords)}): {', '.join(keywords)}")
    log(f"Location: {location}")
    log(f"Posting Freshness: Past {freshness:g} Hours | Scope: {limit_desc}")
    log(f"Full Page Fetching (Rich Details & Degree): {'ENABLED' if enable_details else 'DISABLED'}")

    store = JobStore(output_dir=OUTPUT_DIR)
    
    use_linkedin = "linkedin" in sources
    use_naukri = "naukri" in sources
    use_indeed = "indeed" in sources

    linkedin_col = collect_linkedin_jobs if use_linkedin else None
    naukri_col = collect_naukri_jobs if use_naukri else None
    indeed_col = collect_indeed_jobs if use_indeed else None

    # When freshness <= 24h and max-jobs is unlimited, cap search pages to 6 per keyword.
    # On job portals, postings from the last 4-24 hours are concentrated in the first 3-5 pages.
    # Capping prevents infinite crawling through 50 historical pages.
    naukri_max_pages = None
    if freshness <= 24 and max_jobs is None:
        naukri_max_pages = 6

    # LinkedIn search cards omit descriptions and experience; its detail enrichment uses a fast guest API (~0.4s/job, no browser).
    # We keep it enabled by default so full_description, min_experience_years, and max_experience_years are always populated.
    lk_enable_details = True if os.getenv("DISABLE_LINKEDIN_DETAILS", "").lower() not in ("1", "true", "yes") else False

    lk_kwargs = {
        "keywords": keywords,
        "location": location,
        "max_jobs_per_keyword": max_jobs,
        "max_age_hours": freshness,
        "enable_detail_pages": lk_enable_details,
    } if use_linkedin else None

    nk_kwargs = {
        "titles": keywords,
        "location": location,
        "max_pages": naukri_max_pages,
        "max_jobs": max_jobs,
        "max_total": max_jobs,
        "max_age_hours": freshness,
        "enable_detail_pages": enable_details,
        "headless": NAUKRI_HEADLESS,
    } if use_naukri else None

    id_kwargs = {
        "keywords": keywords,
        "location": location,
        "max_jobs": max_jobs,
        "max_jobs_per_keyword": max_jobs,
        "max_age_hours": freshness,
    } if use_indeed else None

    log("Connecting to live job feeds...")
    start_time = time.time()
    try:
        report = run_pipeline(
            store=store,
            linkedin_collector=linkedin_col,
            linkedin_kwargs=lk_kwargs,
            naukri_collector=naukri_col,
            naukri_kwargs=nk_kwargs,
            indeed_collector=indeed_col,
            indeed_kwargs=id_kwargs,
            apply_enrichment=True,
        )
        duration_seconds = time.time() - start_time

        # Save the current extracted batch to a dedicated Excel-ready CSV & latest_extracted_jobs.csv
        from pipeline.audit_logger import (
            detect_domain_from_keywords,
            save_batch_extraction_csv,
            record_extraction_run,
            print_extraction_summary_card,
        )

        domain_name, slot_num = detect_domain_from_keywords(keywords, domain_hint=args.domain)
        extracted_batch = getattr(report, "extracted_jobs", None) or getattr(report, "new_jobs", [])

        # 1. DIRECT SUPABASE CLOUD SYNC (In-Memory, Zero CSV Requirement)
        sb_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        sb_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        total_jobs = 0

        if sb_url and sb_key and not sb_key.startswith("your_"):
            try:
                from database import sync_records_to_supabase, get_supabase_client
                res = sync_records_to_supabase(extracted_batch)
                synced_count = res.get("synced", 0)
                log(f"Supabase Cloud synchronized: {synced_count} jobs upserted directly.")

                # Live count in Supabase
                client = get_supabase_client()
                if client:
                    count_res = client.table("jobs").select("job_id", count="exact").limit(1).execute()
                    total_jobs = count_res.count or 0
                    log(f"Total live jobs in Supabase Cloud: {total_jobs:,}")
            except Exception as sb_err:
                log(f"Supabase direct sync note: {sb_err}")

        # 2. Optional local CSV export if explicitly requested (--export-local-csv)
        batch_filename = f"Jobs_{domain_name}_{datetime.now().strftime('%H%M%S')}.csv"
        batch_file_path = None
        if getattr(args, "export_local_csv", False):
            try:
                batch_file_path, batch_filename, batch_count = save_batch_extraction_csv(
                    jobs=extracted_batch,
                    domain=domain_name,
                    keywords=", ".join(keywords),
                    location=location,
                )
                rel_save_path = str(batch_file_path.relative_to(ROOT_DIR)).replace("\\", "/")
                log(f"Local backup CSV ({batch_count} jobs) saved to {rel_save_path}")
            except Exception as csv_err:
                log(f"Local CSV export note: {csv_err}")

        new_count = report.new_jobs_written
        log(f"Catalog successfully synced. Total jobs in database: {total_jobs:,} (+{new_count} newly added to catalog, {len(extracted_batch)} in this batch)")

        def _get_val(obj, key, default=""):
            if isinstance(obj, dict):
                return obj.get(key, default)
            return getattr(obj, key, default)

        by_source = {}
        for j in extracted_batch:
            src = _get_val(j, "source", "Unknown")
            by_source[src] = by_source.get(src, 0) + 1

        # Record extraction run into master history CSV (Data/extraction_history.csv)
        record_extraction_run(
            domain=domain_name,
            slot=slot_num,
            keywords=", ".join(keywords),
            location=location,
            sources=", ".join([s.capitalize() for s in sources]),
            extracted_count=len(extracted_batch),
            new_jobs_added=new_count,
            total_db_jobs=total_jobs,
            by_source=by_source,
            duration_seconds=duration_seconds,
            status="SUCCESS",
            batch_filename=batch_filename,
            batch_file_path=batch_file_path,
        )

        # Print executive summary card to terminal
        print_extraction_summary_card(
            domain=domain_name,
            extracted_count=len(extracted_batch),
            new_jobs_added=new_count,
            total_db_jobs=total_jobs,
            batch_filename=batch_filename,
            duration_seconds=duration_seconds,
            by_source=by_source,
            batch_file_path=batch_file_path,
        )

        sample_jobs = []
        for j in extracted_batch[:12]:
            sample_jobs.append({
                "title": _get_val(j, "title", ""),
                "company": _get_val(j, "company", ""),
                "city": _get_val(j, "city", ""),
                "source": _get_val(j, "source", ""),
                "degree_required": _get_val(j, "degree_required", "Not Specified"),
                "min_experience_years": _get_val(j, "min_experience_years", ""),
                "max_experience_years": _get_val(j, "max_experience_years", ""),
                "link": _get_val(j, "link", ""),
            })

        rel_batch_path = ""
        try:
            rel_batch_path = str(batch_file_path.relative_to(ROOT_DIR)).replace("\\", "/")
        except Exception:
            rel_batch_path = str(batch_file_path).replace("\\", "/")

        summary_json = {
            "status": "success",
            "domain": domain_name,
            "slot": slot_num,
            "extracted_jobs": len(extracted_batch),
            "new_jobs": new_count,
            "total_jobs": total_jobs,
            "sources": sources,
            "by_source": by_source,
            "freshness": freshness,
            "keywords": keywords,
            "location": location,
            "latest_csv": "latest_extracted_jobs.csv",
            "batch_csv": batch_filename,
            "batch_csv_path": rel_batch_path,
            "sample_jobs": sample_jobs,
        }
        print(f"__RESULT_JSON__{json.dumps(summary_json)}", flush=True)

    except Exception as exc:
        log(f"Error during scrape execution: {exc}")
        try:
            from pipeline.audit_logger import detect_domain_from_keywords, record_extraction_run
            domain_name, slot_num = detect_domain_from_keywords(
                keywords if "keywords" in locals() else "",
                domain_hint=getattr(args, "domain", None) if "args" in locals() else None,
            )
            record_extraction_run(
                domain=domain_name,
                slot=slot_num,
                keywords=", ".join(keywords) if "keywords" in locals() else "",
                location=location if "location" in locals() else "India",
                sources=", ".join([s.capitalize() for s in sources]) if "sources" in locals() else "Unknown",
                extracted_count=0,
                new_jobs_added=0,
                total_db_jobs=0,
                duration_seconds=time.time() - start_time if "start_time" in locals() else 0.0,
                status="FAILED",
                error_notes=str(exc),
            )
        except Exception:
            pass
        err_json = {
            "status": "error",
            "message": str(exc),
        }
        print(f"__RESULT_JSON__{json.dumps(err_json)}", flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
