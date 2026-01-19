"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Moon, Sun, UserCircle } from "lucide-react";
import { NavItems } from "@/config/app";
import { Icons } from "./icons";
import { SessionProvider, useSession, signOut } from "next-auth/react";
import SidebarSkeleton from "./sidebar-skeleton";
import { env } from "@/env.mjs";
import { toast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const AppNavComponent = () => {
  const [mounted, setMounted] = useState(false);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const items = NavItems();
  const { data: session } = useSession();
  const router = useRouter();
  const isGuest = session?.user?.isGuest;
  const { setTheme, theme } = useTheme();

  useEffect(() => {
    if (typeof window !== "undefined") {
    
      localStorage.removeItem("sidebarExpanded"); 

      const saved = window.localStorage.getItem("sidebarExpanded");
      if (saved !== null) {
        setIsSidebarExpanded(JSON.parse(saved));
      } else {
        setIsSidebarExpanded(false);
      }

      setMounted(true);
      }
    }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("sidebarExpanded");
      if (saved !== null) {
        setIsSidebarExpanded(JSON.parse(saved));
      }
      setMounted(true);
    }
  }, []);

  useEffect(() => {
    if (mounted && typeof window !== "undefined") {
      window.localStorage.setItem(
        "sidebarExpanded",
        JSON.stringify(isSidebarExpanded)
      );
    }
  }, [isSidebarExpanded, mounted]);

  const toggleSidebar = () => {
    setIsSidebarExpanded(!isSidebarExpanded);
  };

  const getNavItemName = (href) => {
    const item = items.find((item) => item.href === href);
    return item ? item.title : href;
  };

  const handleNavClick = (e, href) => {
    e.preventDefault();

    if (isGuest && ["/chats", "/settings", "/support"].includes(href)) {
      toast({
        title: "Create an account to access this feature",
        description: `You need to be signed in to get access to ${getNavItemName(
          href
        )}`,
        variant: "destructive",
      });
      return;
    }

    router.push(href);
  };

  if (!mounted) return <SidebarSkeleton />;

  return (
    <div
      className={cn(
        isSidebarExpanded ? "w-[200px]" : "w-[68px]",
        "pr-4 h-full"
      )}
    >
      <div
        className={cn(
          isSidebarExpanded ? "w-[200px]" : "w-[68px]",
          "border-r transition-all duration-300 ease-in-out transform hidden sm:flex h-full bg-background"
        )}
      >
        <aside className="flex flex-col w-full h-full px-4 overflow-x-hidden break-words columns-1">
          <div className="my-4">
            <Link
              href="/ui-dashboard"
              className="text-lg font-semibold"
              prefetch={false}
            >
              <div className="flex items-center gap-2">
                {isSidebarExpanded ? (
                  <>
                    <img src="/icon.png" alt="logo" width={40} height={40} />
                    <span className="text-xl font-bold md:text-2xl">
                      {env.NEXT_PUBLIC_APP_NAME.slice(0, -2)}
                      <span className="text-primary">
                        {env.NEXT_PUBLIC_APP_NAME.slice(-2)}
                      </span>
                    </span>
                  </>
                ) : (
                  <img src="/icon.png" alt="logo" width={50} height={50} />
                )}
              </div>
            </Link>
          </div>
          {/* Top */}
          <div className="relative pb-2 mt-4">
            <div className="flex flex-col gap-2 space-y-1">
              {items
                .filter((item) => item.position === "top")
                .map((item, idx) => (
                  <Fragment key={idx}>
                    <div className="space-y-1" id={item.id}>
                      <SideNavItem
                        label={item.title}
                        icon={item.icon}
                        path={item.href}
                        active={item.active}
                        isSidebarExpanded={isSidebarExpanded}
                        onClick={(e) => handleNavClick(e, item.href)}
                      />
                    </div>
                  </Fragment>
                ))}
            </div>
          </div>
          {/* Bottom */}
          <div className="sticky bottom-0 block mt-auto mb-4 space-y-2 transition duration-200 whitespace-nowrap">
            {items
              .filter((item) => item.position === "bottom")
              .map((item, idx) => (
                <Fragment key={idx}>
                  <div className="space-y-1">
                    <SideNavItem
                      label={item.title}
                      icon={item.icon}
                      path={item.href}
                      active={item.active}
                      isSidebarExpanded={isSidebarExpanded}
                      onClick={(e) => handleNavClick(e, item.href)}
                    />
                  </div>
                </Fragment>
              ))}
            {/* User Profile & Theme Toggle */}
            <div className="pt-4 border-t border-muted-foreground/20 space-y-1">
              {/* Profile */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  {isSidebarExpanded ? (
                    <button 
                      className="h-full w-full relative flex items-center whitespace-nowrap rounded-md hover:bg-primary hover:text-neutral-200 text-neutral-700 dark:text-neutral-300"
                      aria-label="Open profile menu"
                      aria-haspopup="true"
                    >
                      <div className="relative font-base text-sm py-1.5 px-2 flex flex-row items-center space-x-2 rounded-md duration-100">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={session?.user?.image} alt={session?.user?.name} />
                          <AvatarFallback className="text-xs">
                            {session?.user?.name?.charAt(0)?.toUpperCase() || <UserCircle className="h-4 w-4" />}
                          </AvatarFallback>
                        </Avatar>
                        <span>Profile</span>
                      </div>
                    </button>
                  ) : (
                    <TooltipProvider delayDuration={70}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button 
                            className="h-full w-full relative flex items-center justify-center whitespace-nowrap rounded-md hover:bg-primary hover:text-neutral-200 text-neutral-700 dark:text-neutral-300"
                            aria-label="Open profile menu"
                            aria-haspopup="true"
                          >
                            <div className="relative flex flex-row items-center p-2 space-x-2 text-sm duration-100 rounded-md font-base">
                              <Avatar className="h-5 w-5">
                                <AvatarImage src={session?.user?.image} alt={session?.user?.name} />
                                <AvatarFallback className="text-xs">
                                  {session?.user?.name?.charAt(0)?.toUpperCase() || <UserCircle className="h-4 w-4" />}
                                </AvatarFallback>
                              </Avatar>
                            </div>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="px-3 py-1.5 text-xs" sideOffset={10}>
                          <span>Profile</span>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="right" className="w-48">
                  <div className="px-4 py-2 border-b">
                    <p className="text-sm font-medium truncate">{session?.user?.name}</p>
                    <p className="text-xs text-gray-500 truncate">{session?.user?.email}</p>
                  </div>
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="flex items-center gap-2 font-medium cursor-pointer text-md">
                      <UserCircle className="w-4 h-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <button
                      onClick={() => signOut({ callbackUrl: "/login", redirect: true })}
                      className="w-full font-medium text-left cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Theme Toggle */}
              {isSidebarExpanded ? (
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="h-full w-full relative flex items-center whitespace-nowrap rounded-md hover:bg-primary hover:text-neutral-200 text-neutral-700 dark:text-neutral-300"
                  aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                >
                  <div className="relative font-base text-sm py-1.5 px-2 flex flex-row items-center space-x-2 rounded-md duration-100">
                    {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                    <span>Theme</span>
                  </div>
                </button>
              ) : (
                <TooltipProvider delayDuration={70}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                        className="h-full w-full relative flex items-center justify-center whitespace-nowrap rounded-md hover:bg-primary hover:text-neutral-200 text-neutral-700 dark:text-neutral-300"
                        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                      >
                        <div className="relative flex flex-row items-center p-2 space-x-2 text-sm duration-100 rounded-md font-base">
                          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                        </div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="px-3 py-1.5 text-xs" sideOffset={10}>
                      <span>Theme</span>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </aside>
        <div className="mt-[calc(calc(90vh)-40px)] relative">
          <button
            type="button"
            className="absolute bottom-80 right-[-12px] flex h-6 w-6 items-center justify-center border border-muted-foreground/20 rounded-full bg-accent shadow-md hover:shadow-lg transition-shadow duration-300 ease-in-out"
            onClick={toggleSidebar}
          >
            {isSidebarExpanded ? (
              <ChevronLeft size={16} className="stroke-foreground" />
            ) : (
              <ChevronRight size={16} className="stroke-foreground" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const SideNavItem = ({
  label,
  icon,
  path,
  active,
  isSidebarExpanded,
  onClick,
}) => {
  return (
    <>
      {isSidebarExpanded ? (
        <Link
          href={path}
          onClick={(e) => onClick(e, path)}
          className={`h-full relative flex items-center whitespace-nowrap rounded-md ${
            active
              ? "font-base text-sm bg-primary text-white"
              : "hover:bg-primary hover:text-neutral-200 text-neutral-700 dark:text-neutral-300"
          }`}
        >
          <div className="relative font-base text-sm py-1.5 px-2 flex flex-row items-center space-x-2 rounded-md duration-100">
            {icon}
            <span>{label}</span>
          </div>
        </Link>
      ) : (
        <TooltipProvider delayDuration={70}>
          <Tooltip>
            <TooltipTrigger>
              <Link
                href={path}
                onClick={(e) => onClick(e, path)}
                className={`h-full relative flex items-center whitespace-nowrap rounded-md ${
                  active
                    ? "font-base text-sm bg-primary text-white shadow-sm"
                    : "hover:bg-primary hover:text-neutral-200 text-neutral-700 dark:text-neutral-300"
                }`}
              >
                <div className="relative flex flex-row items-center p-2 space-x-2 text-sm duration-100 rounded-md font-base">
                  {icon}
                </div>
              </Link>
            </TooltipTrigger>
            <TooltipContent
              side="left"
              className="px-3 py-1.5 text-xs"
              sideOffset={10}
            >
              <span>{label}</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </>
  );
};

export const AppNav = () => {
  return (
    <SessionProvider>
      <AppNavComponent />
    </SessionProvider>
  );
};
