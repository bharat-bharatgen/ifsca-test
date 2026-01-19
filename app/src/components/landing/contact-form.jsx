"use client";

import { useState } from "react";
import { LoaderIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import axios from "axios";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { HoverBorderGradient } from "./hover-border-gradient";
import { zodResolver } from "@hookform/resolvers/zod";

const formSchema = z.object({
  name: z.string().min(3, "Name is too short"),
  email: z.string().email("Invalid email address"),
  subject: z.string().min(3, "Subject is too short"),
  message: z.string().min(10, "Message is too short"),
});

export const ContactForm = () => {
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
      const response = await axios.post("/api/v1/contact", data);

      if (response.status !== 200) {
        throw new Error("Failed to submit form");
      }

      toast({
        title: "Form submitted",
        description: "We will get back to you shortly",
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
    <section id="contact" className="w-full py-12 md:py-24 lg:py-32">
      <div className="container px-4 md:px-0">
        <div className="flex flex-col items-center justify-center mb-5 space-y-2 text-center">
          <div className="inline-block px-3 py-1 text-sm rounded-lg text-primary">
            <HoverBorderGradient
              containerClassName="rounded-full"
              as="button"
              className="flex items-center space-x-2 text-black bg-white dark:bg-black dark:text-white"
            >
              Contact
            </HoverBorderGradient>
          </div>
          <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
            Get in touch
          </h2>
          <p className="max-w-[600px] text-gray-500 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
            Ready to get started? Contact us today.
          </p>
        </div>
        <div className="flex justify-center">
          <div className="flex-1 space-y-8 md:mr-8">
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="p-8 space-y-6 rounded-md md:px-0 lg:px-20 dark:bg-none"
            >
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="Enter your name"
                  className="w-full border border-gray-300 rounded-md dark:border-gray-700"
                  {...register("name")}
                />
                {errors.name && (
                  <p className="text-red-500">{errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  placeholder="Enter your email"
                  type="email"
                  className="w-full border border-gray-300 rounded-md dark:border-gray-700"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-red-500">{errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  placeholder="Enter your subject"
                  className="w-full border border-gray-300 rounded-md dark:border-gray-700"
                  {...register("subject")}
                />
                {errors.subject && (
                  <p className="text-red-500">{errors.subject.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  placeholder="Enter your message"
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-md min-h-[100px]"
                  {...register("message")}
                />
                {errors.message && (
                  <p className="text-red-500">{errors.message.message}</p>
                )}
              </div>
              <Button
                type="submit"
                className="flex items-center justify-center w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <LoaderIcon className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Submit
              </Button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
};
