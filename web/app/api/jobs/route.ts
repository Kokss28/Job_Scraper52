import { NextRequest, NextResponse } from "next/server";
import {
  getDashboardStats,
  getPaginatedJobs,
  getAllJobsForExport,
  invalidateJobsCache,
} from "@/lib/data-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const forceRefresh = searchParams.get("refresh") === "true";
    const statsOnly = searchParams.get("statsOnly") === "true";
    const isExport = searchParams.get("export") === "true";

    if (forceRefresh) {
      invalidateJobsCache();
    }

    // High-speed pre-aggregated stats (< 25 KB)
    const stats = await getDashboardStats();

    if (statsOnly) {
      return NextResponse.json({
        success: true,
        total: stats.totalJobs,
        byLocation: stats.byLocation,
        topSkills: stats.topSkills,
        dailyTrend: stats.dailyTrend,
        isCloudSupabase: stats.isCloudSupabase,
      });
    }

    const query = searchParams.get("q") || searchParams.get("query") || "";
    const city = searchParams.get("city") || "";
    const state = searchParams.get("state") || "";
    const skill = searchParams.get("skill") || "";
    const source = searchParams.get("source") || "";
    const experience = searchParams.get("experience") || "";
    const sort = (searchParams.get("sort") || "recent") as any;
    const hours = searchParams.get("hours") ? parseInt(searchParams.get("hours")!, 10) : undefined;

    // Full export query (without pagination clamping)
    if (isExport) {
      const exportJobs = await getAllJobsForExport({
        query,
        city,
        state,
        skill,
        source,
        experience,
        sort,
        hours,
      });

      return NextResponse.json({
        success: true,
        jobs: exportJobs,
        total: exportJobs.length,
        isCloudSupabase: stats.isCloudSupabase,
      });
    }

    // Server-side paginated jobs query
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "25", 10);

    const paginated = await getPaginatedJobs({
      page,
      pageSize,
      query,
      city,
      state,
      skill,
      source,
      experience,
      sort,
      hours,
    });

    return NextResponse.json({
      success: true,
      total: paginated.totalCount,
      page: paginated.page,
      pageSize: paginated.pageSize,
      totalPages: paginated.totalPages,
      jobs: paginated.jobs,
      isCloudSupabase: paginated.isCloudSupabase,
      stats: {
        totalJobs: stats.totalJobs,
        byLocation: stats.byLocation,
        topSkills: stats.topSkills,
      },
    });
  } catch (error: any) {
    console.error("API /api/jobs error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch jobs data" },
      { status: 500 }
    );
  }
}
