/** Shared Recharts tooltip styles that follow light/dark CSS variables. */
export const CHART_TOOLTIP_WRAPPER_STYLE = {
  zIndex: 50,
  outline: "none",
} as const;

export const CHART_TOOLTIP_CONTENT_STYLE = {
  backgroundColor: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  color: "var(--foreground)",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.18)",
  opacity: 1,
} as const;

export const CHART_TOOLTIP_LABEL_STYLE = {
  color: "var(--foreground)",
  fontWeight: 600,
  marginBottom: 4,
} as const;

export const CHART_GRID_STROKE = "var(--border)";
