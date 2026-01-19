"use client";

import { env } from "@/env.mjs";
import { HoverBorderGradient } from "./hover-border-gradient";
import { VideoPlayer } from "./VideoPlayer";

export const DemoCard = () => {
  return (
    <section id="demo" className="w-full py-12 md:py-24 lg:py-32">
      <div className="container px-4 md:px-6">
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <div className="space-y-2">
            <div className="inline-block px-3 py-1 text-sm rounded-lg text-primary">
              <HoverBorderGradient
                containerClassName="rounded-full"
                as="button"
                className="flex items-center space-x-2 text-black bg-white dark:bg-black dark:text-white"
              >
                Demo
              </HoverBorderGradient>
            </div>
            <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
              Experience {env.NEXT_PUBLIC_APP_NAME} in action
            </h2>
            <p className="max-w-[600px] text-gray-500 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              Watch our demo to see how {env.NEXT_PUBLIC_APP_NAME} can help your business.
            </p>
          </div>
          <div className="grid items-center max-w-5xl pt-8 pb-4 mx-auto">
            <VideoPlayer />
          </div>
        </div>
      </div>
    </section>
  );
};
