"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const Eruda = dynamic(
  () => import("./eruda-provider").then((module) => module.Eruda),
  { ssr: false },
);

export function ErudaProvider(props: { children: ReactNode }) {
  return <Eruda>{props.children}</Eruda>;
}
