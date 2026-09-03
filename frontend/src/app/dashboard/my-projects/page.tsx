"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  createProject,
  deleteProject,
  fetchMyProjects,
  type Project,
} from "@/lib/projects";

function formatCreatedAt(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function DeleteIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export default function MyProjectsPage() {
  const [name, setName] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadProjects = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    try {
      const rows = await fetchMyProjects();
      setProjects(rows);
      if (!silent) setError(null);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "Failed to load projects");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const projectName = name.trim();
    if (!projectName) {
      setError("Project name is required");
      return;
    }

    setSaving(true);
    try {
      await createProject({ name: projectName });
      setName("");
      setMessage("Project saved");
      await loadProjects({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save project");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(project: Project) {
    setError(null);
    setMessage(null);
    setDeletingId(project.id);
    try {
      await deleteProject(project.id);
      setProjects((current) => current.filter((row) => row.id !== project.id));
      setMessage("Project deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          My Projects
        </h1>
        <p className="mt-1 text-slate-600">Add and manage your projects.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <form onSubmit={onSubmit} className="max-w-3xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block min-w-0 flex-1">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Project Name
              </span>
              <input
                type="text"
                name="projectName"
                required
                value={name}
                onChange={(event) => {
                  setMessage(null);
                  setName(event.target.value);
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-200"
              />
            </label>

            <button
              type="submit"
              disabled={saving}
              className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          {(message || error) && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {message && (
                <span className="text-sm text-emerald-600">{message}</span>
              )}
              {error && <span className="text-sm text-red-600">{error}</span>}
            </div>
          )}
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            Loading projects…
          </p>
        ) : projects.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            No projects yet.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Project Name
                </th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Created
                </th>
                <th className="w-14 px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span className="sr-only">Delete</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr
                  key={project.id}
                  className="border-b border-slate-100 last:border-b-0"
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {project.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatCreatedAt(project.created_at)}
                  </td>
                  <td className="px-2 py-3 text-center">
                    <button
                      type="button"
                      aria-label={`Delete ${project.name}`}
                      disabled={deletingId === project.id}
                      onClick={() => void onDelete(project)}
                      className="inline-flex rounded-lg p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950/40"
                    >
                      <DeleteIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
