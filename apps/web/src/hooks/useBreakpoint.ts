import { useState, useEffect } from "react";

export const BP_MOBILE  = 640;
export const BP_TABLET  = 1024;

export function useBreakpoint() {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, []);

  return {
    width,
    isMobile:  width < BP_MOBILE,
    isTablet:  width >= BP_MOBILE && width < BP_TABLET,
    isDesktop: width >= BP_TABLET,
  };
}
