import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ErudaProvider } from "./eruda";
import { MiniKitProvider } from "takis-minikit-js/minikit-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "IDKit Next.js Example",
  description: "World ID request + session example using @worldcoin/idkit",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <MiniKitProvider>
          <ErudaProvider>{children}</ErudaProvider>
        </MiniKitProvider>
      </body>
    </html>
  );
}
