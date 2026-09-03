import { query } from "./db.ts";

/**
 * Notify everyone when a user's birthday starts in Japan time.
 * Feb 29 birthdays notify on Feb 28 in non-leap years. Once per JST year.
 */
export async function notifyDueBirthdays(): Promise<number> {
  const { rowCount } = await query(
    `WITH today AS (
       SELECT
         EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Tokyo'))::integer AS year,
         EXTRACT(MONTH FROM (NOW() AT TIME ZONE 'Asia/Tokyo'))::integer AS month,
         EXTRACT(DAY FROM (NOW() AT TIME ZONE 'Asia/Tokyo'))::integer AS day
     ),
     leap AS (
       SELECT
         t.year,
         (
           t.year % 4 = 0
           AND (t.year % 100 <> 0 OR t.year % 400 = 0)
         ) AS is_leap
       FROM today t
     ),
     honorees AS (
       SELECT u.id
       FROM users u
       CROSS JOIN today t
       CROSS JOIN leap l
       WHERE u.birthday IS NOT NULL
         AND (
           (
             EXTRACT(MONTH FROM u.birthday) = t.month
             AND EXTRACT(DAY FROM u.birthday) = t.day
           )
           OR (
             EXTRACT(MONTH FROM u.birthday) = 2
             AND EXTRACT(DAY FROM u.birthday) = 29
             AND t.month = 2
             AND t.day = 28
             AND NOT l.is_leap
           )
         )
     )
     INSERT INTO birthday_notification (user_id, recipient_user_id, actor_user_id, year)
     SELECT h.id, u.id, h.id, t.year
     FROM honorees h
     CROSS JOIN users u
     CROSS JOIN today t
     ON CONFLICT (user_id, recipient_user_id, year) DO NOTHING`,
  );
  return rowCount ?? 0;
}
