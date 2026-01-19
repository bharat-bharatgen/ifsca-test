"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HoverBorderGradient } from "./hover-border-gradient";
import { Icons } from "@/components/icons";

export const FeaturesCard = () => {
  return (
    <section
      id="features"
      className="w-full py-12 md:py-24 lg:py-32 mt-[60vh] md:mt-[80vh]"
    >
      <div className="px-4 md:px-6">
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <div className="space-y-2 mb-12">
            <div className="inline-block px-3 py-1 text-sm rounded-lg text-primary">
              <HoverBorderGradient
                containerClassName="rounded-full"
                as="button"
                className="flex items-center space-x-2 text-black bg-white dark:bg-black dark:text-white"
              >
                Features
              </HoverBorderGradient>
            </div>
            <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
              Powerful features <br /> built for Micro, Small & Medium
              Enterprises
            </h2>
            <p className="text-gray-500 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              Features injected with AI to help you predict risks in your
              business contracts.
            </p>
          </div>
          <div className="flex flex-col items-center justify-center text-left md:flex-row gap-x-8 gap-y-4">
            <Card className="max-w-64 h-60">
              <CardHeader>
                <Icons.goal className="w-8 h-8 mb-4 text-primary" />
                <CardTitle>Accuracy</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Accurately predict the risks in your business contracts. Our
                  AI models are trained on millions of data points to give you
                  the best results.
                </CardDescription>
              </CardContent>
            </Card>
            <Card className="max-w-64 h-60">
              <CardHeader>
                <Icons.handShake className="w-8 h-8 mb-4 text-primary" />
                <CardTitle>Security</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Your data is secure with us. We use the latest security
                  technologies to keep your data safe.
                </CardDescription>
              </CardContent>
            </Card>
            <Card className="max-w-64 h-60">
              <CardHeader>
                <Icons.globe className="w-8 h-8 mb-4 text-primary" />
                <CardTitle>Extensive</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Our models can predict risks in a wide range of industries.
                  From finance to healthcare, we have you covered.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
};
