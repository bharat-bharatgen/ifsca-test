"use client";

import { usePathname } from "next/navigation";
import {
  Home,
  ReceiptText,
  Settings,
  UsersIcon,
  MessageCircleQuestion,
  MessageSquareIcon,
  Building2,
  BarChart3,
  Key,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getSession } from "next-auth/react";

export const NavItems = () => {
  const pathname = usePathname();
  const [isLawyer, setIsLawyer] = useState(false);
  const [isGlobalChatUser, setIsGlobalChatUser] = useState(false);

  useEffect(() => {
    const checkUserStatus = async () => {
      const sessionData = await getSession();
      if (sessionData && sessionData?.user?.role?.name === "lawyer") {
        setIsLawyer(true);
      }
      if (sessionData && sessionData?.user?.role?.name === "global-chat") {
        setIsGlobalChatUser(true);
      }
    };
    checkUserStatus();
  }, []);

  const isNavItemActive = (pathname, nav) => pathname.includes(nav);

  // If user is global-chat type, only show global-chat navigation
  if (isGlobalChatUser) {
    return [
      {
        id: "global-chat",
        title: "Global Chat",
        href: "/global-chat",
        icon: <MessageSquareIcon size={20} />,
        active: isNavItemActive(pathname, "/global-chat"),
        position: "top",
      },
    ];
  }

  return [
    // {
    //   id: "dashboard",
    //   title: "Dashboard",
    //   href: "/app",
    //   icon: <Home size={20} />,
    //   active: pathname === "/app",
    //   position: "top",
    // },
    // {
    //   id: "contracts",
    //   title: "Contracts",
    //   href: "/contracts",
    //   icon: <ReceiptText size={20} />,
    //   active: isNavItemActive(pathname, "/contracts"),
    //   position: "top",
    // },
    // Marketplace hidden from UI
    // !isLawyer && {
    //   id: "lawyers",
    //   title: "Marketplace",
    //   href: "/lawyers",
    //   icon: <UsersIcon size={20} />,
    //   active: isNavItemActive(pathname, "/lawyers"),
    //   position: "top",
    // },
    {
      id: "ui-dashboard",
      title: "UI Dashboard",
      href: "/ui-dashboard",
      icon: <BarChart3 size={20} />,
      active: isNavItemActive(pathname, "/ui-dashboard"),
      position: "top",
    },
    {
      id: "global-chat",
      title: "Global Chat",
      href: "/global-chat",
      icon: <MessageSquareIcon size={20} />,
      active: isNavItemActive(pathname, "/global-chat"),
      position: "top",
    },
    // Chats hidden from UI
    // {
    //   id: "chats",
    //   title: "Chats",
    //   href: "/chats",
    //   icon: <MessageSquareIcon size={20} />,
    //   active: isNavItemActive(pathname, "/chats"),
    //   position: "top",
    // },
    {
      id: "team",
      title: "Team",
      href: "/team",
      icon: <Users size={20} />,
      active: isNavItemActive(pathname, "/team"),
      position: "top",
    },
    {
      id: "api-keys",
      title: "API Keys",
      href: "/api-keys",
      icon: <Key size={20} />,
      active: isNavItemActive(pathname, "/api-keys"),
      position: "top",
    },
    // {
    //   title: "Support",
    //   href: "/support",
    //   icon: <MessageCircleQuestion size={20} />,
    //   active: isNavItemActive(pathname, "/support"),
    //   position: "bottom",
    // },
    // {
    //   title: "Settings",
    //   href: "/settings",
    //   icon: <Settings size={20} />,
    //   active: isNavItemActive(pathname, "/settings"),
    //   position: "bottom",
    // },
  ].filter(Boolean);
};
