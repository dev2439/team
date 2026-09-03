import type { ResumeEducation, ResumeEmployment, ResumeProfile } from "./types.ts";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value) && value.length > 0) {
    return asRecord(value[0]);
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if ("json" in record && record.json && typeof record.json === "object") {
    return asRecord(record.json);
  }
  if ("output" in record && record.output && typeof record.output === "object") {
    return asRecord(record.output);
  }
  return record;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function asEmployment(value: unknown): ResumeEmployment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const row = asRecord(item) ?? {};
    return {
      company: asString(row.company),
      role: asString(row.role),
      location: asString(row.location),
      period: asString(row.period),
      description: asString(row.description),
    };
  });
}

function asEducation(value: unknown): ResumeEducation {
  const row = asRecord(value) ?? {};
  return {
    university: asString(row.university),
    degree: asString(row.degree),
    period: asString(row.period),
    description: asString(row.description),
  };
}

function asEducationList(value: unknown): ResumeEducation[] {
  if (Array.isArray(value)) {
    return value.map(asEducation).slice(0, 2);
  }
  if (value && typeof value === "object") {
    return [asEducation(value)];
  }
  return [];
}

export function parseResumeProfile(payload: unknown): ResumeProfile | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  const title = asString(record.title);
  const overview = asString(record.overview);
  const skills = Array.isArray(record.skills)
    ? record.skills.map(asString).filter(Boolean)
    : [];
  const employment = asEmployment(record.employment);
  const education = asEducationList(record.education);

  const hourlyRate = asString(record.hourlyRate);

  if (!title && !overview) {
    return null;
  }

  return { title, overview, skills, employment, education, hourlyRate };
}
