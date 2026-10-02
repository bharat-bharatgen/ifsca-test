"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { FolderOpen, MessageSquare, Users, KeyRound, LogOut, Plug, BarChart3, Menu, UserCircle } from "lucide-react";
import { ThemeToggle } from "@/components/chat/theme-toggle";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/chat/primitives";
import { cn } from "@/lib/utils";
export function AppNav({ roleName }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const restricted = roleName === "global-chat";
  const links = restricted ? [["Chat", "/global-chat", MessageSquare]] : [["Chat", "/global-chat", MessageSquare], ["Documents", "/ui-dashboard", FolderOpen], ["Integrations", "/integrations", Plug], ["Team", "/team", Users], ["API keys", "/api-keys", KeyRound]];
  if (session?.user?.email === "usage@example.com") links.push(["Usage", "/usage", BarChart3]);
  return <header className="workspace-nav flex shrink-0 items-center gap-x-2 sm:gap-x-6 border-b px-4 py-2 sm:px-6">
    <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><img src="/assets/bharatGen-logo.png" width="132" height="34" alt="BharatGen" className="w-28 sm:w-[132px] rounded bg-white p-1" /></Link>
    <nav aria-label="Workspace" className="hidden gap-1 sm:flex">{links.map(([label, href, Icon]) => <Link key={href} href={href} aria-current={pathname.startsWith(href) || href === "/ui-dashboard" && pathname.startsWith("/documents/") ? "page" : undefined} className={cn("flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground", (pathname.startsWith(href) || href === "/ui-dashboard" && pathname.startsWith("/documents/")) && "bg-accent text-foreground")}><Icon className="size-4" />{label}</Link>)}</nav>
    <div className="sm:hidden"><DropdownMenu><DropdownMenuTrigger><Button variant="ghost" size="icon" aria-label="Workspace navigation"><Menu className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent>{links.map(([label,href,Icon]) => <DropdownMenuItem key={href} render={<Link href={href} />}><Icon className="mr-2 size-4" />{label}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu></div>
    <div className="ml-auto flex items-center gap-1"><ThemeToggle /><DropdownMenu><DropdownMenuTrigger><Button variant="ghost" size="icon" aria-label="Account menu"><UserCircle className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onClick={() => signOut({callbackUrl:"/login"})}><LogOut className="mr-2 size-4" />Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
  </header>;
}
