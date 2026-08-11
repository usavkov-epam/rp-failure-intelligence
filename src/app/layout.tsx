import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import ThemeProvider from "@/components/ThemeProvider";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Failure intelligence",
  description: "Authorized ReportPortal failure analytics with read-only Cypress source links",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body><ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange><TooltipProvider>{children}<Toaster richColors /></TooltipProvider></ThemeProvider></body>
    </html>
  );
}
