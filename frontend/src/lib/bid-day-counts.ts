import type { Bid, BidDayMemberCount } from "@/lib/bids";

export type MemberCount = {
  id: number;
  name: string;
  count: number;
};

function sortMemberCounts(rows: MemberCount[]): MemberCount[] {
  return [...rows].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
}

export function countsFromBids(bids: Bid[]): MemberCount[] {
  const map = new Map<number, MemberCount>();
  for (const bid of bids) {
    const existing = map.get(bid.user_id);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(bid.user_id, {
        id: bid.user_id,
        name: bid.user_name || "Unknown",
        count: 1,
      });
    }
  }
  return sortMemberCounts([...map.values()]);
}

export function countsFromSummary(
  members: BidDayMemberCount[] | undefined,
): MemberCount[] {
  return sortMemberCounts(
    (members ?? []).map((row) => ({
      id: row.user_id,
      name: row.user_name,
      count: row.count,
    })),
  );
}
