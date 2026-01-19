"use client";

import Link from "next/link";
import { Icons } from "../icons";
import { env } from "@/env.mjs";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { toast } from "../ui/use-toast";
import Image from "next/image";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import axios from "axios";

const formSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const Footer = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm({
    resolver: zodResolver(formSchema),
  });

  const onSubmit = async (data) => {
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      const response = await axios.post("/api/v1/newsletter", data);

      if (response.status !== 200) {
        throw new Error("Failed to submit form");
      }

      toast({
        title: "Subscribed to newsletter",
        description: "You have been subscribed to our newsletter.",
        variant: "default",
      });

      reset();
    } catch (error) {
      toast({
        title: "Something went wrong",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="py-10 bg-background sm:pt-16 lg:pt-0">
      <hr className="mt-16 mb-10 bg-primary" />
      <div className="px-4 mx-auto sm:px-6 lg:px-8 max-w-7xl">
        <div className="grid grid-cols-2 gap-x-5 gap-y-12 md:grid-cols-4 md:gap-x-12">
          <div>
            <p className="text-base font-medium cursor-pointer text-neutral-600 dark:text-neutral-50 dark:hover:text-neutral-300 hover:text-neutral-500">
              Product
            </p>
            <ul className="mt-8 space-y-4">
              <li>
                <Link
                  href="#features"
                  title=""
                  className="text-base transition-all duration-200 text-muted-foreground hover:text-opacity-80 focus:text-opacity-80"
                >
                  Features
                </Link>
              </li>
              <li>
                <Link
                  href="#demo"
                  title=""
                  className="text-base transition-all duration-200 text-muted-foreground hover:text-opacity-80 focus:text-opacity-80"
                >
                  Demo
                </Link>
              </li>
              <li>
                <Link
                  href="#pricing"
                  title=""
                  className="text-base transition-all duration-200 text-muted-foreground hover:text-opacity-80 focus:text-opacity-80"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  href="#faq"
                  title=""
                  className="text-base transition-all duration-200 text-muted-foreground hover:text-opacity-80 focus:text-opacity-80"
                >
                  FAQ
                </Link>
              </li>
              <li>
                <Link
                  href="#contact"
                  title=""
                  className="text-base transition-all duration-200 text-muted-foreground hover:text-opacity-80 focus:text-opacity-80"
                >
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-base font-medium cursor-pointer text-neutral-600 dark:text-neutral-50 dark:hover:text-neutral-300 hover:text-neutral-500">
              Resources
            </p>

            <ul className="mt-8 space-y-4">
              <li>
                <Link
                  href="/blogs"
                  aria-disabled="true"
                  title=""
                  className="text-base transition-all duration-200 cursor-pointer text-muted-foreground hover:text-opacity-80 focus:text-opacity-80"
                >
                  Blog
                </Link>
              </li>
              {/* <li>
                <Link
                  href=""
                  aria-disabled="true"
                  title=""
                  className="text-base transition-all duration-200 pointer-events-none text-muted-foreground hover:text-opacity-80 focus:text-opacity-80"
                >
                  Docs
                </Link>
              </li>
              <li>
                <Link
                  href=""
                  aria-disabled="true"
                  title=""
                  className="text-base transition-all duration-200 pointer-events-none text-muted-foreground hover:text-opacity-80 focus:text-opacity-80"
                >
                  Development Tutorial
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  aria-disabled="true"
                  title=""
                  className="text-base transition-all duration-200 pointer-events-none text-muted-foreground hover:text-opacity-80 focus:text-opacity-80"
                >
                  YouTube Playlist
                </Link>
              </li> */}
            </ul>
          </div>

          <div>
            <p className="text-base font-medium cursor-pointer text-neutral-600 dark:text-neutral-50 dark:hover:text-neutral-300 hover:text-neutral-500">
              Legal
            </p>

            <ul className="mt-8 space-y-4">
              <li>
                <Link
                  href="/support"
                  title=""
                  className="text-base transition-all duration-200 text-muted-foreground hover:text-opacity-80 focus:text-opacity-80"
                >
                  Customer Support
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  title=""
                  className="text-base transition-all duration-200 text-muted-foreground hover:text-opacity-80 focus:text-opacity-80"
                >
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  title=""
                  className="text-base transition-all duration-200 text-muted-foreground hover:text-opacity-80 focus:text-opacity-80"
                >
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <div className="col-span-2 md:col-span-1 lg:col-span-2 lg:pl-8">
              <p className="text-sm font-semibold tracking-widest uppercase cursor-pointer hover:text-neutral-400 text-muted-foreground">
                Subscribe to newsletter
              </p>

              <form
                onSubmit={handleSubmit(onSubmit)}
                className="mt-6"
                id="newsletter-form"
              >
                <div>
                  <Label htmlFor="email" className="sr-only">
                    Email
                  </Label>
                  <Input
                    type="email"
                    name="email"
                    id="email"
                    placeholder="Enter your email"
                    className="block w-full p-4 text-black placeholder-gray-500 transition-all duration-200 bg-white border border-gray-200 rounded-md focus:outline-none focus:border-purple-600 caret-purple-600"
                    {...register("email", { required: "Email is required" })}
                  />
                  {errors.email && (
                    <p className="text-red-500">{errors.email.message}</p>
                  )}
                </div>

                <Button
                  disabled={isSubmitting || errors.email}
                  className="inline-flex items-center justify-center px-6 py-4 mt-3 font-semibold text-white transition-all duration-200 bg-purple-600 rounded-md cursor-pointer hover:bg-purple-700 focus:bg-purple-700"
                >
                  {isSubmitting ? "Subscribing..." : "Subscribe"}
                </Button>
              </form>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between mt-10 -mb-5">
          <Link className="flex items-center gap-2" href="#">
            <img src="/icon.png" alt="logo" width={50} height={50} />
            <span className="text-xl font-bold md:text-3xl">
              {env.NEXT_PUBLIC_APP_NAME.slice(0, -2)}
              <span className="text-primary">
                {env.NEXT_PUBLIC_APP_NAME.slice(-2)}
              </span>
            </span>
          </Link>

          <ul className="flex items-center space-x-2 md:order-3">
            <Link href="https://linkedin.com/company/outriskai">
              <Image
                src="/assets/socials/Linkedin.png"
                alt="LinkedIn"
                width={30}
                height={30}
              />
            </Link>

            <Link href="https://www.youtube.com/@OutRiskAI">
              <Image
                src="/assets/socials/Youtube.png"
                alt="YouTube"
                width={30}
                height={30}
              />
            </Link>

            <Link href="https://instagram.com/outriskai/">
              <Image
                src="/assets/socials/Instagram.png"
                alt="Instagram"
                width={30}
                height={30}
              />
            </Link>

            <Link href="#">
              <Image
                src="/assets/socials/X.png"
                alt="X"
                width={30}
                height={30}
              />
            </Link>
          </ul>

          <p className="w-full mt-8 text-sm text-center text-muted-foreground md:mt-0 md:w-auto md:order-2">
            © {(new Date().getFullYear())}, {env.NEXT_PUBLIC_APP_NAME}. All rights reserved.
          </p>
        </div>
      </div>
    </section>
  );
};
