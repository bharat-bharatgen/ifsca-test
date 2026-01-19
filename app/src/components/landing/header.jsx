"use client";

import Link from "next/link";
import { FloatingNav } from "./floating-navbar";
import { CustomSheet } from "./custom-sheet";
import { env } from "@/env.mjs";

export const Header = () => {
  return (
    <header
      id="home"
      className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 shadow-md md:relative bg-background border-muted md:shadow-none"
    >
      <Link className="flex items-center gap-2" href="#">
        <img src="/icon.png" alt="logo" width={50} height={50} />
        <span className="text-xl font-bold md:text-3xl">
          {env.NEXT_PUBLIC_APP_NAME.slice(0, -2)}
          <span className="text-primary">
            {env.NEXT_PUBLIC_APP_NAME.slice(-2)}
          </span>
        </span>
      </Link>
      <FloatingNav />
      <CustomSheet />
    </header>
  );
};
