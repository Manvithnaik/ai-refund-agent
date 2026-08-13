import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShopEase RefundBot — AI Customer Support",
  description: "AI-powered customer support agent for e-commerce refund processing",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
