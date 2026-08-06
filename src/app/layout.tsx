import type { Metadata } from "next";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Failure intelligence",
  description: "Authorized ReportPortal failure analytics with read-only Cypress source links",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body><AppRouterCacheProvider>{children}</AppRouterCacheProvider></body>
    </html>
  );
}
