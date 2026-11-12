import fs from "fs";
import path from "path";
import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import {
  UnifiedJobRecord,
  classifyEducation,
  parseExpNumber,
  computeCareerTier,
  formatExpDisplay,
  normalizeIndianHub,
} from "./taxonomy";

export * from "./taxonomy";

export interface DashboardStats {
  totalJobs: number;
  byLocation: { state: string; city: string; count: number }[];
  topSkills: { skill: string; count: number }[];
  dailyTrend: { date: string; count: number }[];
  isCloudSupabase: boolean;
}

export interface JobFilterParams {
  page?: number;
  pageSize?: number;
  query?: string;
  city?: string;
  state?: string;
  skill?: string;
}

export interface PaginatedJobsResult {
  jobs: UnifiedJobRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isCloudSupabase: boolean;
}

// In-memory cache for fast sub-millisecond responses
let cachedStats: { data: DashboardStats; timestamp: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes (aligns with scraper frequency)

export function invalidateJobsCache(): void {
  cachedStats = null;
}

// ---------------------------------------------------------------------------
// 1. HIGH-SPEED AGGREGATED STATS (< 25 KB payload)
// ---------------------------------------------------------------------------
export async function getDashboardStats(): Promise<DashboardStats> {
  if (cachedStats && Date.now() - cachedStats.timestamp < CACHE_TTL_MS) {
    return cachedStats.data;
  }

  if (hasEnvVars) {
    try {
      const supabase = await createClient();

      // 1. Try querying the ultra-fast PostgreSQL Materialized View
      const { data, error } = await supabase
        .from("dashboard_stats")
        .select("total_jobs, by_location, top_skills, daily_trend")
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        const stats: DashboardStats = {
          totalJobs: Number(data.total_jobs || 0),
          byLocation: Array.isArray(data.by_location) ? data.by_location : [],
          topSkills: Array.isArray(data.top_skills) ? data.top_skills : [],
          dailyTrend: Array.isArray(data.daily_trend) ? data.daily_trend : [],
          isCloudSupabase: true,
        };
        cachedStats = { data: stats, timestamp: Date.now() };
        return stats;
      }

      // 2. Fallback if Materialized View hasn't been executed yet:
      // Query exact total count and top recent rows for instant aggregation
      const countRes = await supabase.from("jobs").select("job_id", { count: "exact", head: true });
      const total = countRes.count || 0;

      // Fetch up to 3,000 recent rows across ranges for accurate location & skills representation
      const sampleRows: any[] = [];
      const CHUNK = 1000;
      for (let p = 0; p < 3; p++) {
        const { data } = await supabase
          .from("jobs")
          .select("city, state, skills, collected_at")
          .order("collected_at", { ascending: false })
          .range(p * CHUNK, (p + 1) * CHUNK - 1);
        if (data && data.length > 0) {
          sampleRows.push(...data);
          if (data.length < CHUNK) break;
        } else {
          break;
        }
      }

      const locMap = new Map<string, number>();
      const skillMap = new Map<string, number>();
      const dateMap = new Map<string, number>();

      for (const r of sampleRows) {
        if (r.city && r.city !== "Not Specified") {
          const key = `${r.state || "Other"}||${r.city}`;
          locMap.set(key, (locMap.get(key) || 0) + 1);
        }
        if (r.skills && r.skills !== "Not Specified") {
          for (const s of String(r.skills).split(",")) {
            const sk = s.trim();
            if (sk && sk.length > 1) {
              skillMap.set(sk, (skillMap.get(sk) || 0) + 1);
            }
          }
        }
        if (r.collected_at) {
          const d = String(r.collected_at).slice(0, 10);
          dateMap.set(d, (dateMap.get(d) || 0) + 1);
        }
      }

      const byLocation = Array.from(locMap.entries())
        .map(([k, count]) => {
          const [state, city] = k.split("||");
          return { state, city, count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 50);

      const topSkills = Array.from(skillMap.entries())
        .map(([skill, count]) => ({ skill, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 30);

      const dailyTrend = Array.from(dateMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 30);

      const stats: DashboardStats = {
        totalJobs: total,
        byLocation,
        topSkills,
        dailyTrend,
        isCloudSupabase: true,
      };
      cachedStats = { data: stats, timestamp: Date.now() };
      return stats;
    } catch (err) {
      console.warn("Could not query Supabase stats, falling back to local:", err);
    }
  }

  // Local fallback stats
  const localJobs = loadJobsFromLocalCsv();
  const locMap = new Map<string, number>();
  const skillMap = new Map<string, number>();
  const dateMap = new Map<string, number>();

  for (const r of localJobs) {
    if (r.city && r.city !== "Not Specified") {
      const key = `${r.state || "Other"}||${r.city}`;
      locMap.set(key, (locMap.get(key) || 0) + 1);
    }
    if (r.skills && r.skills !== "Not Specified") {
      for (const s of String(r.skills).split(",")) {
        const sk = s.trim();
        if (sk && sk.length > 1) {
          skillMap.set(sk, (skillMap.get(sk) || 0) + 1);
        }
      }
    }
    if (r.collected_at) {
      const d = String(r.collected_at).slice(0, 10);
      dateMap.set(d, (dateMap.get(d) || 0) + 1);
    }
  }

  const stats: DashboardStats = {
    totalJobs: localJobs.length,
    byLocation: Array.from(locMap.entries())
      .map(([k, count]) => {
        const [state, city] = k.split("||");
        return { state, city, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 50),
    topSkills: Array.from(skillMap.entries())
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30),
    dailyTrend: Array.from(dateMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.date.localeCompare(a.date)),
    isCloudSupabase: false,
  };
  cachedStats = { data: stats, timestamp: Date.now() };
  return stats;
}

// ---------------------------------------------------------------------------
// 2. SERVER-PAGINATED JOBS (Only 20 to 50 lightweight card rows)
// ---------------------------------------------------------------------------
export async function getPaginatedJobs(
  params: JobFilterParams = {}
): Promise<PaginatedJobsResult> {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(10, params.pageSize || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  if (hasEnvVars) {
    try {
      const supabase = await createClient();

      let query = supabase
        .from("jobs")
        .select(
          "job_id, source, title, company, city, state, country, min_experience_years, max_experience_years, skills, degree_required, collected_at, link",
          { count: "exact" }
        );

      // Server-side text search
      if (params.query?.trim()) {
        const q = params.query.trim();
        query = query.or(
          `title.ilike.%${q}%,company.ilike.%${q}%,skills.ilike.%${q}%,city.ilike.%${q}%`
        );
      }

      // City filter
      if (params.city && params.city !== "All India") {
        query = query.ilike("city", `%${params.city.trim()}%`);
      }

      // State filter
      if (params.state) {
        query = query.ilike("state", `%${params.state.trim()}%`);
      }

      // Skill filter
      if (params.skill) {
        query = query.ilike("skills", `%${params.skill.trim()}%`);
      }

      const { data, count, error } = await query
        .order("collected_at", { ascending: false, nullsFirst: false })
        .range(from, to);

      if (!error && data) {
        const totalCount = count || 0;
        const enriched: UnifiedJobRecord[] = data.map((j: any) => {
          const minExp = parseExpNumber(j.min_experience_years);
          const maxExp = parseExpNumber(j.max_experience_years);
          const edu = classifyEducation(j.degree_required);
          return {
            ...j,
            min_exp_num: minExp,
            max_exp_num: maxExp,
            career_tier: computeCareerTier(minExp, maxExp),
            normalized_location: normalizeIndianHub(j.city, j.state, j.country),
            edu_cluster: edu.edu_cluster,
            edu_subcluster: edu.edu_subcluster,
            edu_degrees: edu.edu_degrees,
            exp_display: formatExpDisplay(minExp, maxExp),
          };
        });

        return {
          jobs: enriched,
          totalCount,
          page,
          pageSize,
          totalPages: Math.ceil(totalCount / pageSize),
          isCloudSupabase: true,
        };
      }
    } catch (e) {
      console.warn("Supabase paginated query failed, falling back to local CSV:", e);
    }
  }

  // Local fallback filtering
  const allLocal = loadJobsFromLocalCsv();
  let filtered = allLocal;

  if (params.query?.trim()) {
    const q = params.query.toLowerCase().trim();
    filtered = filtered.filter(
      (j) =>
        j.title?.toLowerCase().includes(q) ||
        j.company?.toLowerCase().includes(q) ||
        j.skills?.toLowerCase().includes(q)
    );
  }

  if (params.city && params.city !== "All India") {
    const c = params.city.toLowerCase();
    filtered = filtered.filter((j) => j.city?.toLowerCase().includes(c));
  }

  if (params.skill) {
    const s = params.skill.toLowerCase();
    filtered = filtered.filter((j) => j.skills?.toLowerCase().includes(s));
  }

  const totalCount = filtered.length;
  const pageSlice = filtered.slice(from, to + 1);

  return {
    jobs: pageSlice,
    totalCount,
    page,
    pageSize,
    totalPages: Math.ceil(totalCount / pageSize),
    isCloudSupabase: false,
  };
}

// ---------------------------------------------------------------------------
// 3. ON-DEMAND FULL DESCRIPTION (< 5 KB per click)
// ---------------------------------------------------------------------------
export async function getJobFullDescription(jobId: string): Promise<string | null> {
  if (hasEnvVars) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("jobs")
        .select("full_description")
        .eq("job_id", jobId)
        .maybeSingle();

      if (!error && data?.full_description) {
        return data.full_description;
      }
    } catch (e) {
      console.warn("Could not fetch full_description from Supabase:", e);
    }
  }

  const allLocal = loadJobsFromLocalCsv();
  const match = allLocal.find((j) => j.job_id === jobId);
  return match?.full_description || "Full job description is not available for this posting.";
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 4B. DEGREE REPORT JOBS LOADER (Full Market Intelligence with Month / Timeframe Filtering)
// ---------------------------------------------------------------------------
export async function getDegreeReportJobs(timeframe: string = "all"): Promise<{
  jobs: UnifiedJobRecord[];
  isCloudSupabase: boolean;
}> {
  const normalizedTimeframe = (timeframe || "all").toLowerCase();
  const cacheKey = `__degree_report_cache_${normalizedTimeframe}`;
  const cached = (globalThis as any)[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { jobs: cached.jobs, isCloudSupabase: cached.isCloudSupabase };
  }

  if (hasEnvVars) {
    try {
      const supabase = await createClient();
      let query = supabase
        .from("jobs")
        .select(
          "job_id, source, title, company, city, state, country, min_experience_years, max_experience_years, skills, degree_required, collected_at, link"
        )
        .order("collected_at", { ascending: false });

      const now = new Date();
      if (/^\d{4}-\d{2}$/.test(normalizedTimeframe)) {
        const [yearStr, monthStr] = normalizedTimeframe.split("-");
        const y = parseInt(yearStr, 10);
        const m = parseInt(monthStr, 10);
        const start = new Date(y, m - 1, 1).toISOString();
        const end = new Date(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1).toISOString();
        query = query.gte("collected_at", start).lt("collected_at", end);
      } else if (normalizedTimeframe === "this_month") {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        query = query.gte("collected_at", startOfMonth);
      } else if (normalizedTimeframe === "last_month") {
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        query = query.gte("collected_at", startOfLastMonth).lt("collected_at", startOfThisMonth);
      } else if (normalizedTimeframe === "30d") {
        const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte("collected_at", cutoff);
      } else if (normalizedTimeframe === "7d") {
        const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte("collected_at", cutoff);
      }

      // Fetch all available rows for the selected timeframe (in chunks of 1,000)
      const CHUNK_SIZE = 1000;
      const MAX_CHUNKS = normalizedTimeframe === "all" ? 50 : 20;
      let allRows: any[] = [];

      for (let p = 0; p < MAX_CHUNKS; p++) {
        const { data, error } = await query.range(p * CHUNK_SIZE, (p + 1) * CHUNK_SIZE - 1);
        if (error || !data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < CHUNK_SIZE) break;
      }

      if (allRows.length > 0) {
        const enriched: UnifiedJobRecord[] = allRows.map((j: any) => {
          const minExp = parseExpNumber(j.min_experience_years);
          const maxExp = parseExpNumber(j.max_experience_years);
          const edu = classifyEducation(j.degree_required);
          return {
            ...j,
            min_exp_num: minExp,
            max_exp_num: maxExp,
            career_tier: computeCareerTier(minExp, maxExp),
            normalized_location: normalizeIndianHub(j.city, j.state, j.country),
            edu_cluster: edu.edu_cluster,
            edu_subcluster: edu.edu_subcluster,
            edu_degrees: edu.edu_degrees,
            exp_display: formatExpDisplay(minExp, maxExp),
          };
        });

        const result = { jobs: enriched, isCloudSupabase: true };
        (globalThis as any)[cacheKey] = { ...result, timestamp: Date.now() };
        return result;
      }
    } catch (e) {
      console.warn("Supabase degree report query failed, falling back to local catalog:", e);
    }
  }

  // Local fallback
  const localJobs = loadJobsFromLocalCsv();
  const result = { jobs: localJobs, isCloudSupabase: false };
  (globalThis as any)[cacheKey] = { ...result, timestamp: Date.now() };
  return result;
}

// 4. BACKWARD-COMPATIBLE FAST CATALOG LOADER (For legacy sub-pages)
// ---------------------------------------------------------------------------
let cachedCatalog: {
  jobs: UnifiedJobRecord[];
  isCloudSupabase: boolean;
  timestamp: number;
} | null = null;

export async function getJobsCatalog(): Promise<{
  jobs: UnifiedJobRecord[];
  isCloudSupabase: boolean;
}> {
  if (cachedCatalog && Date.now() - cachedCatalog.timestamp < CACHE_TTL_MS) {
    return { jobs: cachedCatalog.jobs, isCloudSupabase: cachedCatalog.isCloudSupabase };
  }

  // Delegate to paginated fetch with 100 recent rows for ultra-fast response
  const paginated = await getPaginatedJobs({ page: 1, pageSize: 100 });
  cachedCatalog = {
    jobs: paginated.jobs,
    isCloudSupabase: paginated.isCloudSupabase,
    timestamp: Date.now(),
  };
  return { jobs: paginated.jobs, isCloudSupabase: paginated.isCloudSupabase };
}

// ---------------------------------------------------------------------------
// 5. LOCAL CSV FALLBACK PARSER
// ---------------------------------------------------------------------------
function loadJobsFromLocalCsv(): UnifiedJobRecord[] {
  try {
    let csvPath = path.resolve(process.cwd(), "../Data/unified_jobs.csv");
    if (!fs.existsSync(csvPath)) {
      csvPath = path.resolve(process.cwd(), "Data/unified_jobs.csv");
    }
    if (!fs.existsSync(csvPath)) return [];

    const fileContent = fs.readFileSync(csvPath, "utf-8");
    const lines = fileContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];

    const headers = parseCsvLine(lines[0]);
    const records: UnifiedJobRecord[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]);
      if (values.length < headers.length) continue;

      const obj: any = {};
      headers.forEach((h, idx) => {
        obj[h] = values[idx] || "Not Specified";
      });

      const minExp = parseExpNumber(obj.min_experience_years);
      const maxExp = parseExpNumber(obj.max_experience_years);
      const edu = classifyEducation(obj.degree_required);

      records.push({
        ...obj,
        min_exp_num: minExp,
        max_exp_num: maxExp,
        career_tier: computeCareerTier(minExp, maxExp),
        normalized_location: normalizeIndianHub(obj.city, obj.state, obj.country),
        edu_cluster: edu.edu_cluster,
        edu_subcluster: edu.edu_subcluster,
        edu_degrees: edu.edu_degrees,
        exp_display: formatExpDisplay(minExp, maxExp),
      });
    }

    return records;
  } catch (err) {
    console.error("Error loading local CSV:", err);
    return [];
  }
}

function parseCsvLine(text: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}
