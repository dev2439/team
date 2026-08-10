"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchCurrentUser, getToken } from "@/lib/auth";

function go(path: string, router: ReturnType<typeof useRouter>) {
  router.replace(path);
  // Fallback if client navigation is blocked/stalled
  window.setTimeout(() => {
    if (window.location.pathname !== path) {
      window.location.replace(path);
    }
  }, 250);
}

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const token = getToken();
      if (!token) {
        go("/login", router);
        return;
      }

      const user = await fetchCurrentUser(token);
      go(user ? "/dashboard/overview" : "/login", router);
    }

    void checkAuth().finally(() => setChecking(false));
  }, [router]);

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-[#f4f6f8] px-6">
      <p className="text-sm text-slate-500">
        {checking ? "Checking session…" : "Redirecting…"}
      </p>
    </div>
  );
}
