"use client";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { HoverBorderGradient } from "./hover-border-gradient";
import faqContent from "@/utils/faqContent";

export const FAQ = () => {
  return (
    <>
      <section id="faq" className="w-full pt-12 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="space-y-2">
              <div className="inline-block px-3 py-1 text-sm rounded-lg text-primary">
                <HoverBorderGradient
                  containerClassName="rounded-full"
                  as="button"
                  className="flex items-center space-x-2 text-black bg-white dark:bg-black dark:text-white"
                >
                  FAQ
                </HoverBorderGradient>
              </div>
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
                Frequently Asked Questions
              </h2>
              <p className="max-w-[600px] text-gray-500 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Have a question? Check out our FAQ section.
              </p>
            </div>
            <main className="flex flex-col items-center justify-center px-4 py-8 md:px-6">
              <div className="container flex items-center justify-center px-4 py-8 mx-auto md:px-6">
                <Card className="shadow-lg w-full md:w-[550px]">
                  <CardContent className="p-6">
                    <Accordion
                      className="w-full"
                      collapsible=""
                      type="multiple"
                    >
                      {faqContent.map((item, index) => (
                        <AccordionItem key={index} value={`item-${index + 1}`}>
                          <AccordionTrigger className="hover:underline-none">
                            {item.title}
                          </AccordionTrigger>
                          <AccordionContent className="text-left">
                            {item.description}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              </div>
            </main>
          </div>
        </div>
      </section>
    </>
  );
};
