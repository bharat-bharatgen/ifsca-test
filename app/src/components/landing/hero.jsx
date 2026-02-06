"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";
import { Icons } from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { HoverBorderGradient } from "./hover-border-gradient";
import { ProductMockupTabs } from "./product-mockup";
import { TextGenerateEffect } from "./text-generate-effect";
import { useEffect, useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { BarChart, CloudLightning, Shield } from "lucide-react";

const productMockups = [
  {
    alt: "Dashboard",
    src: "/assets/images/product-1.webp",
  },
  {
    alt: "Generate",
    src: "/assets/images/product-2.webp",
  },
  {
    alt: "List",
    src: "/assets/images/product-3.webp",
  },
  {
    alt: "Details",
    src: "/assets/images/product-4.webp",
  },
  {
    alt: "Risks",
    src: "/assets/images/product-5.webp",
  },
  {
    alt: "Lawyers",
    src: "/assets/images/product-6.webp",
  },
  {
    alt: "Chats",
    src: "/assets/images/product-7.webp",
  },
];

const productMockupsTabs = productMockups.map((mockup) => ({
  title: mockup.alt,
  value: mockup.alt.toLowerCase().replace(" ", ""),
  content: (
    <Image
      loading="lazy"
      alt={mockup.alt}
      className="object-cover object-center mx-auto overflow-hidden aspect-video rounded-xl sm:w-full lg:order-last"
      height="310"
      src={mockup.src}
      width="850"
    />
  ),
}));

export const Hero = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [session, setSession] = useState();

  useEffect(() => {
    const fetchSession = async () => {
      const sessionData = await getSession();
      setSession(sessionData);
    };
    fetchSession();
  }, []);

  return (
    <section
      id="home"
      className="w-full pt-12 pb-6 md:pt-24 md:pb-12 lg:pt-20 lg:pb-16"
    >
      <div className="container px-4 md:px-6">
        <div className="grid grid-cols-1">
          <div className="flex flex-col items-center justify-center col-span-4 space-y-4 text-center">
            <Link
              href="https://www.producthunt.com/posts/outriskai?embed=true&utm_source=badge-featured&utm_medium=badge&utm_souce=badge-outriskai"
              target="_blank"
            >
              <Image
                src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=533454&theme=light"
                alt="OutRiskAI - Contract&#0032;risk&#0032;analysis&#0032;and&#0032;automation&#0032;tool | Product Hunt"
                style={{ width: "250px", height: "54px" }}
                width="250"
                height="54"
                unoptimized
              />
            </Link>
            <div className="space-y-2 text-center">
              <TextGenerateEffect
                duration={1.5}
                filter={false}
                textSize="text-6xl"
                textStyles="pb-4 font-bold text-transparent bg-gradient-to-tr from-orange-200 to-blue-600 bg-clip-text dark:from-orange-500 dark:to-blue-700"
                words="Eliminate Contract Risks with AI Automation"
              />
              <TextGenerateEffect
                duration={1.5}
                filter={false}
                className="text-2xl font-medium text-gray-700 dark:text-gray-300"
                words="Identify and mitigate risks in your contracts effortlessly."
              />
            </div>
            <div className="flex flex-col gap-2 min-[400px]:flex-row">
              {session ? (
                <Link href="/ui-dashboard">
                  <Button
                    className={cn(
                      buttonVariants({ variant: "default" }),
                      "z-10"
                    )}
                  >
                    Go to Dashboard
                  </Button>
                </Link>
              ) : (
                <div className="relative inline-flex items-center">
                  <Button
                    className={cn(
                      buttonVariants({ variant: "default" }),
                      "z-10"
                    )}
                    onClick={async () => {
                      setIsLoading(true);
                      await signIn("guest", {
                        callbackUrl: "/contracts",
                      });
                      setIsLoading(false);
                    }}
                  >
                    {isLoading ? (
                      <Icons.spinner className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <p>Try Demo</p>
                    )}
                  </Button>
                  <svg
                    className="absolute hidden transform scale-75 right-8 top-10 sm:block text-primary"
                    width="122"
                    height="97"
                    viewBox="0 0 122 97"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M116.102 0.0996005C114.952 0.334095 112.7 1.53002 111.433 2.53834C110.869 2.98388 109.368 4.15635 108.077 5.11778C103.455 8.6352 102.61 9.40903 102.187 10.4877C101.39 12.5982 102.798 14.5914 105.097 14.5914C106.13 14.5914 108.241 13.7941 109.696 12.8561C110.424 12.3871 111.01 12.0823 111.01 12.1526C111.01 12.692 107.796 17.8274 106.2 19.8206C102.023 25.0733 95.6642 29.6928 86.2548 34.2889C81.0926 36.8214 77.4555 38.2753 73.9123 39.2367C71.7066 39.823 70.6507 39.9871 67.9053 40.0809C66.0516 40.1513 64.5499 40.1747 64.5499 40.1278C64.5499 40.0809 64.808 38.9788 65.1365 37.6891C65.465 36.3993 65.8404 34.1716 66.0047 32.7647C66.4505 28.3796 65.4884 24.2994 63.4704 22.2359C62.1564 20.8758 60.9363 20.3599 59.0121 20.3599C57.6043 20.3599 57.1115 20.4537 55.7975 21.1103C52.8878 22.5407 50.5648 25.9878 49.5089 30.4197C48.453 34.922 49.2742 38.0877 52.3481 41.1127C53.4744 42.2148 54.46 42.9183 55.9852 43.6921C57.1584 44.2549 58.1439 44.7473 58.1909 44.7708C58.5898 45.0053 54.5304 53.4705 52.0666 57.6211C47.4674 65.3125 39.3486 74.575 30.5728 82.0789C22.2427 89.2309 16.7285 92.4435 9.87677 94.1553C8.28116 94.554 7.13138 94.6478 4.2452 94.6478C1.17131 94.6712 0.608154 94.7181 0.608154 95.023C0.608154 95.234 1.19478 95.5857 2.13337 95.9609C3.54126 96.4768 3.96363 96.5472 7.41296 96.5237C10.5572 96.5237 11.4724 96.4299 13.1149 96.0078C21.7265 93.6863 31.1594 87.1908 42.6102 75.7006C49.2977 69.0175 52.5828 64.9373 56.1494 58.9343C58.0501 55.7217 60.6312 50.6801 61.7575 47.9365L62.5553 45.9902L64.0806 46.1543C71.3547 46.9047 77.7136 45.3101 88.3667 40.034C96.2274 36.1414 101.976 32.3426 106.505 28.0748C108.617 26.0816 111.855 22.2828 112.794 20.7117C113.028 20.313 113.286 19.9847 113.357 19.9847C113.427 19.9847 113.662 20.782 113.873 21.72C114.084 22.6814 114.647 24.276 115.093 25.2609C115.82 26.8085 116.008 27.043 116.454 26.9727C116.876 26.9258 117.228 26.4333 117.956 24.9795C119.317 22.2828 119.833 20.2661 120.772 13.8879C121.757 7.25168 121.781 4.4143 120.889 2.56179C119.95 0.615488 118.12 -0.322489 116.102 0.0996005ZM60.7016 25.7767C61.4525 26.9023 61.8279 29.2942 61.6637 31.9205C61.4759 34.7813 60.5139 38.9788 60.0681 38.9788C59.5284 38.9788 57.1584 37.6422 56.2198 36.8214C54.8354 35.6021 54.3426 34.2889 54.5538 32.2957C54.8589 29.2473 56.1964 26.2223 57.5808 25.3547C58.7306 24.6512 60.0681 24.8388 60.7016 25.7767Z"
                      fill="currentColor"
                    />
                  </svg>
                </div>
              )}
              <Link href="#contact">
                <HoverBorderGradient
                  containerClassName="rounded-sm"
                  as="button"
                  className="flex items-center space-x-2 text-sm text-black bg-white dark:bg-black dark:text-white"
                >
                  Contact Sales
                </HoverBorderGradient>
              </Link>
            </div>
            <div>
              <ProductMockupTabs
                tabs={productMockupsTabs}
                activeTabClassName="bg-primary dark:bg-primary"
                contentClassName=""
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
