import { useEffect, useState } from "react";

export function useMedia(): "desktop" | "mobile" {
  const getInitialState = (): "desktop" | "mobile" => {
    if (typeof window !== "undefined") {
      return window.matchMedia("(max-width: 1024px)").matches ? "mobile" : "desktop";
    }
    return "desktop";
  };

  const [media, setMedia] = useState<"desktop" | "mobile">(getInitialState);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1024px)");
    const handleChange = (e: MediaQueryList | MediaQueryListEvent) =>
      setMedia(e.matches ? "mobile" : "desktop");

    handleChange(mql);
    mql.addEventListener("change", handleChange);
    return () => {
      mql.removeEventListener("change", handleChange);
    };
  }, []);

  return media;
}
