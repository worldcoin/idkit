"use client";

import eruda from "eruda";
import { useEffect, type ReactNode } from "react";

export function Eruda(props: { children: ReactNode }) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        eruda.init();
      } catch (error) {
        console.log("Eruda failed to initialize", error);
      }
    }
  }, []);

  return <>{props.children}</>;
}
