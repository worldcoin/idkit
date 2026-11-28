import type { SVGProps } from "react";

export function CopyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M12.5 7.5H16.6667V16.6667H7.5V12.5M12.5 7.5H7.5V12.5M12.5 7.5V3.33333H3.33333V12.5H7.5"
        strokeWidth="1.66667"
        stroke="currentColor"
      />
    </svg>
  );
}
