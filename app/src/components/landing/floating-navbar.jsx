"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ThemeToggle } from "../custom/theme-toggle";
import { HoverBorderGradient } from "./hover-border-gradient";
import { useRouter } from "next/navigation";
import { getSession } from "next-auth/react";

/**
 * FloatingNav component
 *
 * @param {string} [props.className] - Additional class name for the component
 *
 * @returns {JSX.Element} The rendered component
 */

export const FloatingNav = ({ className }) => {
  const router = useRouter();
  const [session, setSession] = useState();

  useEffect(() => {
    const fetchSession = async () => {
      const sessionData = await getSession();
      setSession(sessionData);
    };
    fetchSession();
  }, []);

  const blogRoute = router.pathname === "/blogs";
  const navItems = [
    { name: "Home", link: "#home" },
    { name: "Features", link: "#features" },
    { name: "Demo", link: "#demo" },
    { name: "Pricing", link: "#pricing" },
    { name: "Faq", link: "#faq" },
    { name: "Contact", link: "#contact" },
    { name: "Blog", link: "/blogs", active: blogRoute },
  ];

  const handleNavClick = (e, link) => {
    e.preventDefault();

    // If the link is an internal section (starts with #), scroll to it
    if (link.startsWith("#")) {
      const targetElement = document.querySelector(link);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      // If the link is a route (like /blogs), use Next.js's router to navigate
      router.push(link);
    }
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{
          opacity: 1,
          y: 0,
        }}
        animate={{
          y: 0,
          opacity: 1,
        }}
        transition={{
          duration: 0.2,
        }}
        className={cn(
          "max-w-fit hidden md:flex md:mr-20 lg:mx-auto fixed top-4 inset-x-0 mx-auto border border-transparent dark:border-white/[0.2] rounded-full dark:bg-background bg-white shadow-[0px_2px_3px_-1px_rgba(0,0,0,0.1),0px_1px_0px_0px_rgba(25,28,33,0.02),0px_0px_0px_1px_rgba(25,28,33,0.08)] z-[5000] pr-2 pl-8 py-2 items-center justify-center space-x-4",
          className
        )}
      >
        {navItems.map((navItem, idx) => (
          <Link
            key={`link=${idx}`}
            href={navItem.link}
            onClick={(e) => handleNavClick(e, navItem.link)}
            className={cn(
              "relative dark:text-neutral-50 items-center flex space-x-1 text-neutral-600 dark:hover:text-neutral-300 hover:text-neutral-500",
              { active: navItem.active }
            )}
          >
            <span className="hidden text-sm sm:block">{navItem.name}</span>
          </Link>
        ))}
        {!session && (
          <Link href="/login">
            <HoverBorderGradient
              containerClassName="rounded-full"
              as="button"
              className="flex items-center space-x-2 text-sm text-black bg-white dark:bg-black dark:text-white"
            >
              Login
            </HoverBorderGradient>
          </Link>
        )}
        <ThemeToggle />
      </motion.div>
    </AnimatePresence>
  );
};
