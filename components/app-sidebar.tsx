"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLogout } from "@/hooks/use-logout";
import { LayoutDashboard, FolderKanban, LogOut } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator
} from "@/components/ui/sidebar";

interface User {
  id: string;
  user_name?: string;
  name?: string;
  email: string;
  vendor_name?: string;
}

// Fixed nav for the vendor portal - just Dashboard and Projects, both scoped
// server-side to the logged-in vendor's own data. No per-role/module gating
// here (unlike the internal admin tool this app was forked from) - every
// vendor account sees exactly the same two pages.
const NAV_ITEMS = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Projects", href: "/projects", icon: FolderKanban }
];

export function AppSidebar({ user }: { user: User | null }) {
  const pathname = usePathname();
  const handleLogout = useLogout();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/dashboard"
          className="flex h-8 items-center overflow-hidden px-2 py-1.5"
        >
          <Image
            src="/logo.png"
            alt="A2B"
            width={160}
            height={32}
            className="h-full w-auto max-w-full object-contain object-left"
          />
        </Link>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {NAV_ITEMS.map((item) => {
                const IconComponent = item.icon;
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={pathname === item.href}
                      tooltip={item.name}
                    >
                      <IconComponent />
                      <span>{item.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="gap-1">
        <SidebarMenu className="gap-1">
          <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
            <div className="flex flex-col overflow-hidden px-2 py-1.5">
              <span className="truncate text-sm font-semibold text-sidebar-foreground">
                {user?.user_name || user?.name || user?.email || "Vendor User"}
              </span>
              <span className="truncate text-xs text-sidebar-foreground/60">
                {user?.vendor_name || "Vendor"}
              </span>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              tooltip="Logout"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <LogOut />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
