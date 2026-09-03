import { getApiBase, getToken } from "@/lib/auth";

export type Project = {
  id: number;
  user_id: number;
  name: string;
  created_at: string;
};

type ErrorResponse = {
  error: string;
};

async function authFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) {
    throw new Error("Not signed in");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers,
  });

  const data = (await res.json()) as T | ErrorResponse;

  if (!res.ok) {
    throw new Error(
      data && typeof data === "object" && "error" in data
        ? data.error
        : "Request failed",
    );
  }

  return data as T;
}

export async function fetchProjects(): Promise<Project[]> {
  const data = await authFetch<{ projects: Project[] }>("/api/projects");
  return data.projects;
}

export async function fetchMyProjects(): Promise<Project[]> {
  const data = await authFetch<{ projects: Project[] }>("/api/projects/mine");
  return data.projects;
}

export async function createProject(input: {
  name: string;
}): Promise<Project> {
  const data = await authFetch<{ project: Project }>("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
    }),
  });
  return data.project;
}

export async function deleteProject(projectId: number): Promise<void> {
  await authFetch<{ ok: boolean }>(`/api/projects/${projectId}`, {
    method: "DELETE",
  });
}
