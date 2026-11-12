"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Bookmark,
  Building2,
  MapPin,
  Clock,
  ArrowUpRight,
  Trash2,
  CheckCircle2,
  FileText,
  Briefcase,
  Sparkles,
  Download,
} from "lucide-react";
import type { UnifiedJobRecord } from "@/lib/taxonomy";

export type SavedJobItem = {
  job_id: string;
  title: string;
  company: string;
  location: string;
  source: string;
  link: string;
  min_exp?: number | null;
  max_exp?: number | null;
  career_tier?: string;
  status: "saved" | "applied" | "interviewing" | "archived";
  notes: string;
  saved_at: string;
};

// DEFAULT_DEMO_SAVED removed to ensure zero fabricated data

export function SavedJobsClient({
  serverRecords = [],
}: {
  serverRecords?: SavedJobItem[];
}) {
  const [items, setItems] = useState<SavedJobItem[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const local = localStorage.getItem("job_intel_saved_pipeline");
        if (local) {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {
        // ignore
      }
    }
    return serverRecords;
  });

  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [tempNotes, setTempNotes] = useState<string>("");

  // Sync to local storage
  useEffect(() => {
    try {
      localStorage.setItem("job_intel_saved_pipeline", JSON.stringify(items));
    } catch (e) {
      // ignore
    }
  }, [items]);

  const updateStatus = (id: string, newStatus: SavedJobItem["status"]) => {
    setItems((prev) =>
      prev.map((item) =>
        item.job_id === id ? { ...item, status: newStatus } : item
      )
    );
  };

  const removeJob = (id: string) => {
    setItems((prev) => prev.filter((item) => item.job_id !== id));
  };

  const startEditNotes = (item: SavedJobItem) => {
    setEditingNotesId(item.job_id);
    setTempNotes(item.notes || "");
  };

  const saveNotes = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.job_id === id ? { ...item, notes: tempNotes } : item
      )
    );
    setEditingNotesId(null);
  };

  const filteredItems = items.filter((item) => {
    if (filterStatus === "all") return true;
    return item.status === filterStatus;
  });

  const countByStatus = {
    all: items.length,
    saved: items.filter((i) => i.status === "saved").length,
    applied: items.filter((i) => i.status === "applied").length,
    interviewing: items.filter((i) => i.status === "interviewing").length,
    archived: items.filter((i) => i.status === "archived").length,
  };

  const exportPipelineCsv = () => {
    if (!items.length) return;
    const headers = [
      "job_id",
      "title",
      "company",
      "location",
      "source",
      "status",
      "notes",
      "saved_at",
      "link",
    ];
    const rows = [headers.join(",")];
    for (const item of items) {
      rows.push(
        [
          `"${item.job_id}"`,
          `"${(item.title || "").replace(/"/g, '""')}"`,
          `"${(item.company || "").replace(/"/g, '""')}"`,
          `"${(item.location || "").replace(/"/g, '""')}"`,
          `"${item.source}"`,
          `"${item.status}"`,
          `"${(item.notes || "").replace(/"/g, '""')}"`,
          `"${item.saved_at}"`,
          `"${item.link}"`,
        ].join(",")
      );
    }
    const blob = new Blob([rows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `candidate_pipeline_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="relative rounded-2xl bg-white border border-slate-200 p-6 md:p-8 shadow-xs overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold mb-3">
              <Bookmark className="w-3.5 h-3.5" />
              Candidate Workspace &amp; Tracking Board
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
              Saved Opportunities &amp; Application Pipeline
            </h1>
            <p className="text-slate-600 text-xs md:text-sm mt-1 max-w-2xl font-medium leading-relaxed">
              Track candidate applications through hiring stages: Bookmarked, Applied, Interviewing, and Archived with personal interview notes.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={exportPipelineCsv}
              data-testid="export-pipeline-csv"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-bold transition-all shadow-xs"
            >
              <Download className="w-4 h-4 text-indigo-600" />
              Export Pipeline CSV
            </button>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all"
            >
              <Briefcase className="w-4 h-4" />
              Explore More Jobs
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl bg-white border border-slate-200 p-5 border-t-4 border-t-indigo-600 shadow-xs">
          <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Total Tracked
          </div>
          <div className="text-2xl md:text-3xl font-black text-slate-900 mt-1">
            {countByStatus.all}
          </div>
          <div className="text-xs text-slate-500 font-medium mt-0.5">Active in pipeline</div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 p-5 border-t-4 border-t-violet-600 shadow-xs">
          <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Interviewing Stage
          </div>
          <div className="text-2xl md:text-3xl font-black text-violet-700 mt-1">
            {countByStatus.interviewing}
          </div>
          <div className="text-xs text-slate-500 font-medium mt-0.5">Active hiring rounds</div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 p-5 border-t-4 border-t-emerald-600 shadow-xs">
          <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Applications Sent
          </div>
          <div className="text-2xl md:text-3xl font-black text-emerald-700 mt-1">
            {countByStatus.applied}
          </div>
          <div className="text-xs text-slate-500 font-medium mt-0.5">Awaiting feedback</div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 p-5 border-t-4 border-t-amber-500 shadow-xs">
          <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Bookmarked Leads
          </div>
          <div className="text-2xl md:text-3xl font-black text-amber-700 mt-1">
            {countByStatus.saved}
          </div>
          <div className="text-xs text-slate-500 font-medium mt-0.5">Ready to tailor resume</div>
        </div>
      </div>

      {/* Pipeline Filter Strip */}
      <div className="rounded-2xl bg-white border border-slate-200 p-4 flex items-center gap-2 flex-wrap shadow-xs">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-600 mr-2">
          Pipeline Stage:
        </span>
        {[
          { key: "all", label: "All Opportunities", count: countByStatus.all },
          { key: "saved", label: "Bookmarked", count: countByStatus.saved },
          { key: "applied", label: "Applied", count: countByStatus.applied },
          {
            key: "interviewing",
            label: "Interviewing",
            count: countByStatus.interviewing,
          },
          {
            key: "archived",
            label: "Archived",
            count: countByStatus.archived,
          },
        ].map((tab) => {
          const active = filterStatus === tab.key;
          return (
            <button
              key={tab.key}
              data-testid={`tab-${tab.key}`}
              onClick={() => setFilterStatus(tab.key)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 ${
                active
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20"
                  : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  active ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Saved Opportunities List */}
      <div className="space-y-4">
        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500 space-y-3 shadow-xs">
            <Bookmark className="w-8 h-8 mx-auto text-slate-400" />
            <p className="text-base font-bold text-slate-800">
              No jobs in this pipeline stage
            </p>
            <p className="text-xs text-slate-500 font-medium">
              Go to Job Explorer and click the bookmark icon on any job to save it here.
            </p>
            <Link
              href="/dashboard"
              className="inline-block mt-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-colors"
            >
              Browse Job Explorer
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredItems.map((item) => (
              <div
                key={item.job_id}
                className="rounded-xl bg-white border border-slate-200 p-6 hover:border-slate-300 transition-all shadow-xs space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {item.source}
                      </span>
                      {item.career_tier && (
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {item.career_tier}
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-slate-900 text-lg">
                      {item.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 font-medium">
                      <span className="flex items-center gap-1 font-semibold text-slate-900">
                        <Building2 className="w-3.5 h-3.5 text-slate-500" />
                        {item.company}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                        {item.location}
                      </span>
                      {item.min_exp !== undefined && item.min_exp !== null && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-indigo-600" />
                          {item.min_exp}
                          {item.max_exp ? ` - ${item.max_exp}` : "+"} Yrs Exp
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stage Switcher Dropdown */}
                  <div className="flex items-center gap-2 self-start">
                    <select
                      value={item.status}
                      data-testid={`stage-select-${item.job_id}`}
                      onChange={(e) =>
                        updateStatus(
                          item.job_id,
                          e.target.value as SavedJobItem["status"]
                        )
                      }
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-bold text-indigo-700 focus:outline-none focus:border-indigo-600 shadow-xs cursor-pointer"
                    >
                      <option value="saved">📌 Bookmarked</option>
                      <option value="applied">📨 Applied</option>
                      <option value="interviewing">🎯 Interviewing</option>
                      <option value="archived">📦 Archived</option>
                    </select>

                    <button
                      onClick={() => removeJob(item.job_id)}
                      data-testid={`delete-saved-${item.job_id}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Remove from saved"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Candidate Notes Section */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-700 font-bold">
                      <FileText className="w-3.5 h-3.5 text-indigo-600" />
                      Candidate Tracking Notes:
                    </span>
                    {editingNotesId === item.job_id ? (
                      <button
                        onClick={() => saveNotes(item.job_id)}
                        data-testid={`save-note-${item.job_id}`}
                        className="text-xs text-emerald-700 hover:underline font-bold"
                      >
                        Save Note
                      </button>
                    ) : (
                      <button
                        onClick={() => startEditNotes(item)}
                        data-testid={`edit-note-${item.job_id}`}
                        className="text-xs text-indigo-700 hover:underline font-bold"
                      >
                        Edit Note
                      </button>
                    )}
                  </div>

                  {editingNotesId === item.job_id ? (
                    <textarea
                      value={tempNotes}
                      data-testid={`note-textarea-${item.job_id}`}
                      onChange={(e) => setTempNotes(e.target.value)}
                      placeholder="Add interview rounds, recruiter contacts, or referral details..."
                      rows={2}
                      className="w-full p-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-xs font-medium focus:outline-none focus:border-indigo-600"
                    />
                  ) : (
                    <p className="text-slate-700 italic font-medium" data-testid={`note-text-${item.job_id}`}>
                      {item.notes || "No personal notes added yet. Click 'Edit Note' to add notes."}
                    </p>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="pt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">
                    Saved on {new Date(item.saved_at).toLocaleDateString()}
                  </span>

                  <a
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 font-bold transition-colors shadow-xs"
                  >
                    Open Official Posting <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
