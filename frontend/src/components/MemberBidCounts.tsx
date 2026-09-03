import type { MemberCount } from "@/lib/bid-day-counts";

export function MemberBidCounts({ members }: { members: MemberCount[] }) {
  if (members.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {members.map((member) => (
        <li
          key={member.id}
          className={`text-xs ${
            member.count === 0 ? "text-slate-400" : "text-slate-600"
          }`}
        >
          <span className="font-medium text-slate-800 dark:text-slate-200">
            {member.name}
          </span>{" "}
          {member.count}
        </li>
      ))}
    </ul>
  );
}
