import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "FourScreen | 4SCREEN MVP",
  description: "A dark dashboard for monitoring four websites or video links in independent panels.",
  applicationName: "4SCREEN",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
