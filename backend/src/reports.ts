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
  for (let i = 0; i < WEEK_DAYS.length; i++) {
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

export type SubTeamWeekDayTotals = {
  day: WeekDayKey;
  date: string;
  working_time: number;
  bid: number;
  message: number;
  call: number;
  offer: number;
  accounts: number;
  is_today: boolean;
};

export type SubTeamWeekMemberDay = {
  day: WeekDayKey;
  date: string;
  working_time: number;
  bid: number;
  message: number;
  call: number;
  offer: number;
  accounts: number;
  is_today: boolean;
};

export type SubTeamWeekMemberTotals = {
  user_id: number;
  user_name: string;
  working_time: number;
  bid: number;
  message: number;
  call: number;
  offer: number;
  accounts: number;
  days: SubTeamWeekMemberDay[];
};

export type SubTeamWeekReports = {
  sub_team_name: string | null;
  days: SubTeamWeekDayTotals[];
  members: SubTeamWeekMemberTotals[];
  today: WeekDayKey;
};

async function getSubTeamContext(userId: number): Promise<{
  memberIds: number[];
  subTeamName: string | null;
}> {
  const { rows } = await query<{ name: string; user_ids: number[] | null }>(
    `SELECT name, user_ids
     FROM sub_team
     WHERE $1 = ANY(COALESCE(user_ids, '{}'::integer[]))
     ORDER BY id ASC
     LIMIT 1`,
    [userId],
  );

  const team = rows[0];
  if (!team) {
    return { memberIds: [userId], subTeamName: null };
  }

  const memberIds = team.user_ids ?? [];
  return {
    memberIds: memberIds.length > 0 ? memberIds : [userId],
    subTeamName: team.name,
  };
}

export async function getSubTeamWeekReports(
  userId: number,
): Promise<SubTeamWeekReports> {
  const now = new Date();
  const todayIndex = mondayIndexFromDate(now);
  const todayKey = WEEK_DAYS[todayIndex]!;
  const { memberIds, subTeamName } = await getSubTeamContext(userId);

  const [
    { rows: reportRows },
    { rows: bidRows },
    { rows: userRows },
  ] = await Promise.all([
    query<ReportRow>(
      `SELECT id, user_id, working_time, message, "call", offer, accounts, created_at,
              to_char(created_at::date, 'YYYY-MM-DD') AS report_date
       FROM report
       WHERE user_id = ANY($1::integer[])
         AND created_at >= date_trunc('week', CURRENT_TIMESTAMP)
         AND created_at < date_trunc('week', CURRENT_TIMESTAMP) + INTERVAL '7 days'`,
      [memberIds],
    ),
    query<{ user_id: number; day: string; count: string | number }>(
      `SELECT user_id,
              to_char(created_at::date, 'YYYY-MM-DD') AS day,
              COUNT(*)::int AS count
       FROM bid
       WHERE user_id = ANY($1::integer[])
         AND created_at >= date_trunc('week', CURRENT_TIMESTAMP)
         AND created_at < date_trunc('week', CURRENT_TIMESTAMP) + INTERVAL '7 days'
       GROUP BY user_id, created_at::date`,
      [memberIds],
    ),
    query<{ id: number; name: string }>(
      `SELECT id, name
       FROM users
       WHERE id = ANY($1::integer[])
       ORDER BY name ASC`,
      [memberIds],
    ),
  ]);

  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - todayIndex);

  const weekDates: string[] = [];
  for (let i = 0; i < WEEK_DAYS.length; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    weekDates.push(formatLocalDate(date));
  }

  const reportByUserDate = new Map<string, ReportRow>();
  for (const row of reportRows) {
    reportByUserDate.set(`${row.user_id}:${row.report_date}`, row);
  }

  const bidByUserDate = new Map<string, number>();
  for (const row of bidRows) {
    bidByUserDate.set(`${row.user_id}:${row.day}`, Number(row.count) || 0);
  }

  const days: SubTeamWeekDayTotals[] = weekDates.map((dateKey, i) => {
    let working_time = 0;
    let bid = 0;
    let message = 0;
    let call = 0;
    let offer = 0;
    let accounts = 0;

    for (const memberId of memberIds) {
      const report = reportByUserDate.get(`${memberId}:${dateKey}`);
      working_time += report ? Number(report.working_time) || 0 : 0;
      message += report ? Number(report.message) || 0 : 0;
      call += report ? Number(report.call) || 0 : 0;
      offer += report ? Number(report.offer) || 0 : 0;
      accounts += report ? Number(report.accounts) || 0 : 0;
      bid += bidByUserDate.get(`${memberId}:${dateKey}`) ?? 0;
    }

    return {
      day: WEEK_DAYS[i]!,
      date: dateKey,
      working_time,
      bid,
      message,
      call,
      offer,
      accounts,
      is_today: i === todayIndex,
    };
  });

  const members: SubTeamWeekMemberTotals[] = userRows.map((user) => {
    let workingTimeSum = 0;
    let bid = 0;
    let message = 0;
    let call = 0;
    let offer = 0;
    let accounts = 0;

    const memberDays: SubTeamWeekMemberDay[] = weekDates.map((dateKey, i) => {
      const report = reportByUserDate.get(`${user.id}:${dateKey}`);
      const dayWorkingTime = report ? Number(report.working_time) || 0 : 0;
      const dayMessage = report ? Number(report.message) || 0 : 0;
      const dayCall = report ? Number(report.call) || 0 : 0;
      const dayOffer = report ? Number(report.offer) || 0 : 0;
      const dayAccounts = report ? Number(report.accounts) || 0 : 0;
      const dayBid = bidByUserDate.get(`${user.id}:${dateKey}`) ?? 0;

      workingTimeSum += dayWorkingTime;
      message += dayMessage;
      call += dayCall;
      offer += dayOffer;
      accounts = Math.max(accounts, dayAccounts);
      bid += dayBid;

      return {
        day: WEEK_DAYS[i]!,
        date: dateKey,
        working_time: dayWorkingTime,
        bid: dayBid,
        message: dayMessage,
        call: dayCall,
        offer: dayOffer,
        accounts: dayAccounts,
        is_today: i === todayIndex,
      };
    });

    const dayCount = weekDates.length || 1;

    return {
      user_id: user.id,
      user_name: user.name,
      working_time: workingTimeSum / dayCount,
      bid,
      message,
      call,
      offer,
      accounts,
      days: memberDays,
    };
  });

  return {
    sub_team_name: subTeamName,
    days,
    members,
    today: todayKey,
  };
}

export type TeamReportEntry = {
  date: string;
  user_id: number;
  user_name: string;
  sub_team_id: number | null;
  sub_team_name: string | null;
  working_time: number;
  bid: number;
  message: number;
  call: number;
  offer: number;
  accounts: number;
};

type TeamReportRow = {
  user_id: number;
  user_name: string;
  day: string;
  working_time: number;
  message: number;
  call: number;
  offer: number;
  accounts: number;
  sub_team_id: number | null;
  sub_team_name: string | null;
};

type TeamBidCountRow = {
  user_id: number;
  day: string;
  count: string | number;
};

export async function listTeamReports(): Promise<TeamReportEntry[]> {
  const [{ rows: reportRows }, { rows: bidRows }] = await Promise.all([
    query<TeamReportRow>(
      `SELECT
         r.user_id,
         u.name AS user_name,
         to_char(r.created_at::date, 'YYYY-MM-DD') AS day,
         r.working_time,
         r.message,
         r."call",
         r.offer,
         r.accounts,
         (
           SELECT st.id
           FROM sub_team st
           WHERE r.user_id = ANY(COALESCE(st.user_ids, '{}'::integer[]))
           ORDER BY st.id ASC
           LIMIT 1
         ) AS sub_team_id,
         (
           SELECT st.name
           FROM sub_team st
           WHERE r.user_id = ANY(COALESCE(st.user_ids, '{}'::integer[]))
           ORDER BY st.id ASC
           LIMIT 1
         ) AS sub_team_name
       FROM report r
       INNER JOIN users u ON u.id = r.user_id`,
    ),
    query<TeamBidCountRow>(
      `SELECT
         b.user_id,
         to_char(b.created_at::date, 'YYYY-MM-DD') AS day,
         COUNT(*)::int AS count
       FROM bid b
       GROUP BY b.user_id, b.created_at::date`,
    ),
  ]);

  const entries = new Map<string, TeamReportEntry>();

  for (const row of reportRows) {
    const key = `${row.user_id}:${row.day}`;
    entries.set(key, {
      date: row.day,
      user_id: row.user_id,
      user_name: row.user_name,
      sub_team_id: row.sub_team_id,
      sub_team_name: row.sub_team_name,
      working_time: Number(row.working_time) || 0,
      bid: 0,
      message: Number(row.message) || 0,
      call: Number(row.call) || 0,
      offer: Number(row.offer) || 0,
      accounts: Number(row.accounts) || 0,
    });
  }

  const userIdsNeedingNames = new Set<number>();
  for (const row of bidRows) {
    const key = `${row.user_id}:${row.day}`;
    const existing = entries.get(key);
    const bidCount = Number(row.count) || 0;
    if (existing) {
      existing.bid = bidCount;
    } else {
      userIdsNeedingNames.add(row.user_id);
      entries.set(key, {
        date: row.day,
        user_id: row.user_id,
        user_name: "",
        sub_team_id: null,
        sub_team_name: null,
        working_time: 0,
        bid: bidCount,
        message: 0,
        call: 0,
        offer: 0,
        accounts: 0,
      });
    }
  }

  if (userIdsNeedingNames.size > 0) {
    const ids = [...userIdsNeedingNames];
    const { rows: users } = await query<{
      id: number;
      name: string;
      sub_team_id: number | null;
      sub_team_name: string | null;
    }>(
      `SELECT
         u.id,
         u.name,
         (
           SELECT st.id
           FROM sub_team st
           WHERE u.id = ANY(COALESCE(st.user_ids, '{}'::integer[]))
           ORDER BY st.id ASC
           LIMIT 1
         ) AS sub_team_id,
         (
           SELECT st.name
           FROM sub_team st
           WHERE u.id = ANY(COALESCE(st.user_ids, '{}'::integer[]))
           ORDER BY st.id ASC
           LIMIT 1
         ) AS sub_team_name
       FROM users u
       WHERE u.id = ANY($1::integer[])`,
      [ids],
    );

    const userMeta = new Map(users.map((user) => [user.id, user]));
    for (const entry of entries.values()) {
      if (entry.user_name) continue;
      const meta = userMeta.get(entry.user_id);
      if (!meta) continue;
      entry.user_name = meta.name;
      entry.sub_team_id = meta.sub_team_id;
      entry.sub_team_name = meta.sub_team_name;
    }
  }

  return [...entries.values()].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return a.user_name.localeCompare(b.user_name);
  });
}

function currentWeekDateKeys(now = new Date()): Set<string> {
  const todayIndex = mondayIndexFromDate(now);
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - todayIndex);

  const keys = new Set<string>();
  for (let i = 0; i < WEEK_DAYS.length; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    keys.add(formatLocalDate(date));
  }
  return keys;
}

export async function upsertReportForDate(input: {
  userId: number;
  date: string;
  workingTime: number;
  message: number;
  call: number;
  offer: number;
  accounts: number;
}): Promise<Report> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error("date must be YYYY-MM-DD");
  }

  if (!currentWeekDateKeys().has(input.date)) {
    throw new Error("date must be within the current week");
  }

  const existing = await query<{ id: number }>(
    `SELECT id
     FROM report
     WHERE user_id = $1
       AND created_at::date = $2::date
     LIMIT 1`,
    [input.userId, input.date],
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
    `INSERT INTO report (user_id, working_time, message, "call", offer, accounts, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, ($7::date + TIME '12:00'))
     RETURNING id, user_id, working_time, message, "call", offer, accounts, created_at,
               to_char(created_at::date, 'YYYY-MM-DD') AS report_date`,
    [
      input.userId,
      input.workingTime,
      input.message,
      input.call,
      input.offer,
      input.accounts,
      input.date,
    ],
  );

  return mapReport(rows[0]!);
}

export async function upsertTodayReport(input: {
  userId: number;
  workingTime: number;
  message: number;
  call: number;
  offer: number;
  accounts: number;
}): Promise<Report> {
  return upsertReportForDate({
    ...input,
    date: formatLocalDate(new Date()),
  });
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
