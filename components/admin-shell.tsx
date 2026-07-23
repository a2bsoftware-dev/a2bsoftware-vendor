"use client";

import React, { useEffect, useState } from "react";
import { ShieldAlert, Loader2 } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import DashboardHeader from "@/components/dashboard-header";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { apiFetch, getLastActivityAt, refreshTokensSilently } from "@/lib/api";
import { useLogout } from "@/hooks/use-logout";

const TOKEN_REFRESH_INTERVAL_MS = 3 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 30 * 1000;
const IDLE_LOGOUT_LIMIT_MS = 10 * 60 * 1000;

interface User {
  id: string;
  user_name?: string;
  name?: string;
  email: string;
  role_id: string;
  role?: string;
  vendor_id?: string;
  vendor_name?: string;
}

type AuthState = "loading" | "vendor" | "not-vendor";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authState, setAuthState] = useState<AuthState>("loading");
  const logout = useLogout();

  // Keep the session alive on a fixed timer regardless of activity - this is
  // deliberately excluded from idle tracking (see refreshTokensSilently).
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      refreshTokensSilently();
    }, TOKEN_REFRESH_INTERVAL_MS);
    return () => clearInterval(refreshInterval);
  }, []);

  // Idle-logout: lastActivityAt only moves when the user's own actions cause
  // a real API call (apiFetch calls with trackActivity !== false) - the
  // refresh ping above and background polling never touch it.
  useEffect(() => {
    const idleCheckInterval = setInterval(() => {
      if (Date.now() - getLastActivityAt() > IDLE_LOGOUT_LIMIT_MS) {
        logout();
      }
    }, IDLE_CHECK_INTERVAL_MS);
    return () => clearInterval(idleCheckInterval);
  }, [logout]);

  useEffect(() => {
    // Fetch authenticated user details from the backend (Spring Boot owns the
    // session/token check now — this call carries the httpOnly cookies). The
    // backend syncs the logged-in Keycloak user into the local users table as
    // part of this same call, so there's no separate sync request to race
    // against.
    apiFetch("/api/auth/me")
      .then((res) => {
        if (res.ok) {
          return res.json();
        } else {
          window.location.href = "/";
        }
      })
      .then((data) => {
        if (data) {
          setUser(data);
          // vendor_id is the SAME field VendorPortalController.requireVendorId()
          // checks server-side before answering any /api/vendor/** call - this
          // mirrors that check here instead of letting a non-vendor account
          // silently hit 403s on every dashboard/projects fetch with no
          // explanation. A user without it (Admin/PM/whatever role they came
          // in with) simply isn't what this app is for.
          setAuthState(data.vendor_id ? "vendor" : "not-vendor");
        }
      })
      .catch((err) => {
        console.error("Error fetching user session", err);
      });
  }, []);

  if (authState === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
        <span className="text-sm font-medium text-zinc-500">Checking your account...</span>
      </div>
    );
  }

  if (authState === "not-vendor") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center space-y-4 px-4 text-center">
        <ShieldAlert className="h-12 w-12 text-amber-500" />
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Vendor access required</h1>
        <p className="max-w-sm text-sm text-zinc-500">
          This account isn&apos;t linked to a vendor. Contact your A2B account manager to get
          access to the vendor portal.
        </p>
        <Button onClick={logout} variant="outline">
          Log out
        </Button>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar user={user} />
      <SidebarInset>
        <DashboardHeader user={user} />
        <main className="flex-1 w-full min-w-0 p-4 sm:p-6 lg:p-8 space-y-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
