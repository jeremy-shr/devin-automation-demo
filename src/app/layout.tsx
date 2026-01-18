import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Devin Automation - GitHub Issues Integration",
  description: "Integrate GitHub Issues with Devin AI sessions for automated scoping and execution",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
