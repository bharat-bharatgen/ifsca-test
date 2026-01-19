import "./globals.css";
import { Chivo, Gabarito } from "next/font/google";
import { RootProvider } from "@/components/providers/root-provider";
import { getServerSession } from "next-auth";
import { metadata } from "./metadata";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import { ContractProvider } from "@/context/contract-context";
import { ProgressTrackerProvider } from "@/components/progress-tracker";

const gabarito = Gabarito({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-gabarito",
});

const chivo = Chivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-chivo",
});

const inter = Inter({ subsets: ["latin"] });

export { metadata };

export default async function RootLayout({ children }) {
  const session = await getServerSession();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${gabarito.variable} ${chivo.variable} ${inter.className}`}>
        <ContractProvider>
        <RootProvider session={session}>
          <ProgressTrackerProvider>
            {children}
          </ProgressTrackerProvider>
        </RootProvider>
          <Toaster />
        </ContractProvider>
      </body>
    </html>
  );
}
