"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { CheckIcon, LoaderIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { HoverBorderGradient } from "./hover-border-gradient";
import { useRouter } from "next/navigation";
import { useState } from "react";

const pricingInfo = [
  {
    title: "Basic",
    description: "Small teams looking to get started",
    price: "$29/mo",
    features: [
      "30 Contract Uploads",
      "30 Contract Generations",
      "10 Risks Analysis per Contract",
      "10 Solutions per Contract",
      "Up to 50 MB per Contract Upload",
      "Up to 30 Pages per Contract",
    ],
    recommended: false,
  },
  {
    title: "Pro",
    description: "Advance features for growth teams",
    price: "$59/mo",
    features: [
      "All features of Basic Plan",
      "70 Contract Uploads",
      "70 Contract Generations",
      "30 Risks Analysis per Contract",
      "Up to 100 MB per Contract Upload",
      "Up to 40 Pages per Contract",
    ],
    recommended: true,
  },
  {
    title: "Enterprise",
    description: "Custom solutions for large teams",
    price: "Custom",
    features: [
      "Unlimited Contract Uploads",
      "Unlimited Contract Generations",
      "Unlimited Risks Analysis per Contract",
      "Up to 500 MB per Contract Upload",
      "Unlimited Pages per Contract",
    ],
    recommended: false,
  },
];

export const PricingCard = () => {
  return (
    <section id="pricing" className="w-full py-12 md:py-24 lg:py-32">
      <div className="container px-4 md:px-6">
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <div className="space-y-2">
            <div className="inline-block px-3 py-1 text-sm rounded-lg text-primary">
              <HoverBorderGradient
                containerClassName="rounded-full"
                as="button"
                className="flex items-center space-x-2 text-black bg-white dark:bg-black dark:text-white"
              >
                Pricing
              </HoverBorderGradient>
            </div>
            <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
              Simple, transparent pricing
            </h2>
            <p className="max-w-[600px] text-gray-500 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              Choose the plan that works best for your team. No hidden fees, no
              contracts, no surprises.
            </p>
          </div>
          <div className="grid items-center max-w-5xl gap-6 py-12 mx-auto md:grid-cols-2 lg:grid-cols-3 lg:gap-12 ">
            {pricingInfo.map((pricing) => (
              <PricingInfo key={pricing.title} pricing={pricing} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const CheckFeature = ({ pricing }) => {
  return (
    <div
      className={cn(
        "flex justify-center items-center w-4 h-4 rounded-full mx-2 my-1",
        pricing.recommended ? "bg-white opacity-95" : "bg-primary"
      )}
    >
      <CheckIcon
        size="12"
        className={pricing.recommended ? "text-primary" : "text-white"}
      />
    </div>
  );
};

const PricingInfo = ({ pricing }) => {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  return (
    <div className="h-full space-y-2">
      <Card
        className={cn(
          "max-w-72 max-h-200 h-full min-h-200 rounded-xl",
          pricing.recommended
            ? "bg-primary shadow-2xl dark:shadow-blue-900 dark:shadow-lg border-primary"
            : ""
        )}
      >
        <CardHeader>
          <CardTitle
            className={cn(
              "text-3xl",
              pricing.recommended ? "text-white" : "text-primary"
            )}
          >
            {pricing.title}
          </CardTitle>
        </CardHeader>
        <p
          className={cn(
            "mx-2 my-4",
            pricing.recommended ? "text-gray-300" : "text-gray-500"
          )}
        >
          {pricing.description}
        </p>
        <p
          className={cn(
            "py-2 text-4xl font-bold",
            pricing.recommended ? "text-white" : ""
          )}
        >
          {pricing.price}
        </p>
        <div className="flex flex-col items-center justify-between px-2 mb-6">
          <div className="py-4 text-left pricing-col-list">
            {pricing.features.map((feature) => (
              <div
                key={feature}
                className={cn(
                  pricing.recommended ? "text-gray-300" : "text-gray-500"
                )}
              >
                <div style={{ display: "flex", alignItems: "center" }}>
                  <CheckFeature pricing={pricing} />
                  <span>{feature}</span>
                </div>
              </div>
            ))}
          </div>
          <Button
            disabled={isLoading}
            onClick={async () => {
              setIsLoading(true);
              await new Promise((resolve) => {
                setTimeout(() => {
                  if (pricing.title === "Enterprise") {
                    document
                      .querySelector("#contact")
                      .scrollIntoView({ behavior: "smooth" });
                  } else {
                    router.refresh();
                    router.push("/ui-dashboard");
                  }
                  resolve();
                }, 1000);
              });
              setIsLoading(false);
            }}
            variant={pricing.recommended ? "outline" : "default"}
            className={cn(
              "mt-4 w-full",
              pricing.recommended
                ? "border-white border-2 bg-transparent text-white"
                : ""
            )}
          >
            {isLoading ? (
              <LoaderIcon className="w-6 h-6 animate-spin" />
            ) : pricing.title === "Enterprise" ? (
              "Contact Sales"
            ) : (
              "Start Now"
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
};
