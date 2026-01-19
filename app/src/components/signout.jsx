"use client";

import { signOut } from "next-auth/react";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export const SignOutRedirect = () => {
  useEffect(() => {
    signOut({ callbackUrl: "/login" });
  }, []);

  const itemCount = 6;

  return (
    <div className="flex w-full h-full animate-pulse">
      {/* Sidebar */}
      <div className="w-[200px] pr-4 h-full">
        <div className="w-[200px] border-r transition-all duration-300 ease-in-out transform hidden sm:flex h-full bg-background">
          <aside className="flex flex-col w-full h-full px-4 overflow-x-hidden break-words columns-1">
            <div className="my-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-gray-300 rounded-full dark:bg-gray-700 md:h-10 md:w-10">
                  <Skeleton circle height={40} width={40} />
                </div>
                <div className="w-24 h-6 bg-gray-300 rounded dark:bg-gray-700 md:h-8">
                  <Skeleton height={32} width={96} />
                </div>
              </div>
            </div>
            <div className="relative pb-2 mt-4">
              <div className="flex flex-col gap-2 space-y-1">
                {Array.from({ length: itemCount }).map((_, idx) => (
                  <div
                    key={idx}
                    className="w-full h-8 bg-gray-300 rounded dark:bg-gray-700"
                  >
                    <Skeleton height={32} />
                  </div>
                ))}
              </div>
            </div>
            <div className="sticky bottom-0 block mt-auto mb-4 space-y-2 transition duration-200 whitespace-nowrap">
              {Array.from({ length: 2 }).map((_, idx) => (
                <div
                  key={idx}
                  className="w-full h-8 bg-gray-300 rounded dark:bg-gray-700"
                >
                  <Skeleton height={32} />
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 space-y-6">
        {/* Document Risk Assessment */}
        <div className="w-full h-64 bg-gray-300 rounded dark:bg-gray-700">
          <Skeleton height={256} />
        </div>

        {/* Lawyer Marketplace */}
        <div className="w-full h-48 bg-gray-300 rounded dark:bg-gray-700">
          <Skeleton height={192} />
        </div>

        {/* Insights */}
        <div className="flex w-full space-x-4">
          <div className="w-1/3 h-32 bg-gray-300 rounded dark:bg-gray-700">
            <Skeleton height={128} />
          </div>
          <div className="w-1/3 h-32 bg-gray-300 rounded dark:bg-gray-700">
            <Skeleton height={128} />
          </div>
          <div className="w-1/3 h-32 bg-gray-300 rounded dark:bg-gray-700">
            <Skeleton height={128} />
          </div>
        </div>
      </div>
    </div>
  );
};
