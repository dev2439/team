import { query } from "./db.ts";
import type { Report, WeekDayKey, WeekDayReport } from "./types/report.ts";

const WEEK_DAYS: WeekDayKey[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

type ReportRow = {
  id: number;
  user_id: number;
  working_time: number;
  message: number;
  call: number;
  offer: number;
  accounts: number;
  created_at: Date | string;
  report_date: string;
};

type BidCountRow = {
  day: string;
  count: string | number;
};

function mondayIndexFromDate(date: Date): number {
  const jsDay = date.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function getCurrentWeekReports(
  userId: number,
): Promise<{ days: WeekDayReport[]; today: WeekDayKey }> {
  const now = new Date();
  const todayIndex = mondayIndexFromDate(now);
  const todayKey = WEEK_DAYS[todayIndex]!;

  const { rows: reportRows } = await query<ReportRow>(
    `SELECT id, user_id, working_time, message, "call", offer, accounts, created_at,
            to_char(created_at::date, 'YYYY-MM-DD') AS report_date
     FROM report
     WHERE user_id = $1
       AND created_at >= date_trunc('week', CURRENT_TIMESTAMP)
       AND created_at < date_trunc('week', CURRENT_TIMESTAMP) + INTERVAL '7 days'`,
    [userId],
  );

  const { rows: bidRows } = await query<BidCountRow>(
    `SELECT to_char(created_at::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
     FROM bid
     WHERE user_id = $1
       AND created_at >= date_trunc('week', CURRENT_TIMESTAMP)
       AND created_at < date_trunc('week', CURRENT_TIMESTAMP) + INTERVAL '7 days'
     GROUP BY created_at::date`,
    [userId],
  );

  const reportsByDate = new Map<string, ReportRow>();
  for (const row of reportRows) {
    reportsByDate.set(row.report_date, row);
  }

  const bidsByDate = new Map<string, number>();
  for (const row of bidRows) {
    bidsByDate.set(row.day, Number(row.count) || 0);
  }

  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - todayIndex);

  const days: WeekDayReport[] = [];
  for (let i = 0; i <= todayIndex; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateKey = formatLocalDate(date);
    const report = reportsByDate.get(dateKey);

    days.push({
      day: WEEK_DAYS[i]!,
      date: dateKey,
      working_time: report ? Number(report.working_time) : 0,
      bid: bidsByDate.get(dateKey) ?? 0,
      message: report ? Number(report.message) : 0,
      call: report ? Number(report.call) : 0,
      offer: report ? Number(report.offer) : 0,
      accounts: report ? Number(report.accounts) : 0,
      is_today: i === todayIndex,
    });
  }

  return { days, today: todayKey };
}

export async function upsertTodayReport(input: {
  userId: number;
  workingTime: number;
  message: number;
  call: number;
  offer: number;
  accounts: number;
}): Promise<Report> {
  const existing = await query<{ id: number }>(
    `SELECT id
     FROM report
     WHERE user_id = $1
       AND created_at::date = CURRENT_DATE
     LIMIT 1`,
    [input.userId],
  );

  if (existing.rows[0]) {
    const { rows } = await query<ReportRow>(
      `UPDATE report
       SET working_time = $2,
           message = $3,
           "call" = $4,
           offer = $5,
           accounts = $6
       WHERE id = $1
       RETURNING id, user_id, working_time, message, "call", offer, accounts, created_at,
                 to_char(created_at::date, 'YYYY-MM-DD') AS report_date`,
      [
        existing.rows[0].id,
        input.workingTime,
        input.message,
        input.call,
        input.offer,
        input.accounts,
      ],
    );

    return mapReport(rows[0]!);
  }

  const { rows } = await query<ReportRow>(
    `INSERT INTO report (user_id, working_time, message, "call", offer, accounts)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, working_time, message, "call", offer, accounts, created_at,
               to_char(created_at::date, 'YYYY-MM-DD') AS report_date`,
    [
      input.userId,
      input.workingTime,
      input.message,
      input.call,
      input.offer,
      input.accounts,
    ],
  );

  return mapReport(rows[0]!);
}

function mapReport(row: ReportRow): Report {
  return {
    id: row.id,
    user_id: row.user_id,
    working_time: Number(row.working_time),
    message: Number(row.message),
    call: Number(row.call),
    offer: Number(row.offer),
    accounts: Number(row.accounts),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}
