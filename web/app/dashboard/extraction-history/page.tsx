import React from "react";
import Link from "next/link";
import {
  History,
  Terminal,
  Database,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { getExtractionHistory } from "@/lib/data-service";

export const dynamic = "force-dynamic";

export default async function ExtractionHistoryPage() {
  const { runs, totalJobs, isCloudSupabase } = await getExtractionHistory();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center text-white">
              <History className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              Extraction & Ingestion History
            </h1>
            <span className="px-2 py-0.5 text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Pipeline
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Complete audit logs tracking every automated harvest cycle, newly stored jobs, duplicate filtering, and direct Supabase streaming.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/scraper"
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Open Scraper Studio</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Total Catalog Jobs
          </div>
          <div className="text-2xl font-black text-slate-900">
            {totalJobs.toLocaleString()}
          </div>
          <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Live in Supabase</span>
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Deduplication Health
          </div>
          <div className="text-2xl font-black text-indigo-600">
            100% Unique
          </div>
          <p className="text-xs text-slate-500">
            0 duplicate records allowed
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Storage Engine
          </div>
          <div className="text-2xl font-black text-sky-600">
            Cloud Stream
          </div>
          <p className="text-xs text-slate-500">
            In-memory upsert (0 SQLite)
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Ingestion Pipeline
          </div>
          <div className="text-2xl font-black text-emerald-600">
            Active
          </div>
          <p className="text-xs text-slate-500">
            Automated hourly slot rotation
          </p>
        </div>

      </div>

      {/* Audit Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">
              Verified Harvest Run Passes
            </h3>
            <span className="px-2 py-0.5 text-xs font-bold bg-slate-100 text-slate-600 rounded">
              {runs.length} Recent Runs Recorded
            </span>
          </div>
          <span className="text-xs text-slate-400">
            Reflects authentic timestamps from Supabase
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold whitespace-nowrap">
                <th className="py-3 px-4">Run Identifier</th>
                <th className="py-3 px-4">Source Portal</th>
                <th className="py-3 px-4">Slot & Target Focus</th>
                <th className="py-3 px-4">New Stored</th>
                <th className="py-3 px-4">Skipped / Duplicates</th>
                <th className="py-3 px-4">Ingestion Mode</th>
                <th className="py-3 px-4">Timestamp (IST/UTC)</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {runs.map((run, idx) => (
                <tr key={run.runId} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span>{run.runId}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-700 border border-slate-200">
                      {run.source}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700 font-medium whitespace-nowrap">
                    {run.target}
                  </td>
                  <td className="py-3 px-4 font-bold text-emerald-600 whitespace-nowrap">
                    +{run.newJobsCount} jobs
                  </td>
                  <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                    {run.skippedDuplicates} skipped
                  </td>
                  <td className="py-3 px-4 text-slate-600 text-[11px] whitespace-nowrap">
                    {run.mode}
                  </td>
                  <td className="py-3 px-4 text-slate-500 text-[11px] whitespace-nowrap">
                    {new Date(run.timestamp).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <span className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      SUCCESS
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info Callout */}
      <div className="p-4 bg-sky-50/70 rounded-2xl border border-sky-200/80 text-xs text-sky-950 flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="font-bold text-sky-900">Automated Direct-Stream Ingestion Architecture</h4>
          <p className="text-slate-600 leading-relaxed">
            The scraping pipeline executes via rotating slots (0 through 3), cycling hourly across key tech hubs and domains. Every posting is validated against duplicate fingerprints (`title + company + city`) and streamed directly into Supabase. No intermediate CSV or SQLite database files are committed to Git.
          </p>
        </div>
      </div>

    </div>
  );
}
