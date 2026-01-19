import { Footer } from "@/components/landing/footer";
import { ContactForm } from "@/components/landing/contact-form";
import { FAQ } from "@/components/landing/faq";
import { PricingCard } from "@/components/landing/pricing-card";
import { FeaturesCard } from "@/components/landing/features-card";
import { DemoCard } from "@/components/landing/demo-card";
import { Hero } from "@/components/landing/hero";
import { Header } from "@/components/landing/header";
import { cn } from "@/lib/utils";
import { AnimatedGridPattern } from "@/components/animated-grid-pattern";

export default function Home() {
  return (
    <>
      <AnimatedGridPattern
        numSquares={30}
        maxOpacity={0.1}
        duration={3}
        repeatDelay={1}
        className={cn(
          "[mask-image:radial-gradient(500px_circle_at_center,white,transparent)]",
          "inset-x-0 inset-y-[-30%] h-[200%] skew-y-12"
        )}
      />
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1">
          <Hero />

          <FeaturesCard />

          <DemoCard />

          <PricingCard />

          <FAQ />

          <div className="flex items-center justify-center">
            <div className="w-full md:w-1/2">
              <ContactForm />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
}
