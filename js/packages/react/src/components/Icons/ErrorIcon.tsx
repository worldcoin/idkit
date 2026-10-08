import type { SVGProps } from "react";

export function ErrorIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="46"
      height="46"
      viewBox="0 0 46 46"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
      className={`idkit-error-svg ${props.className ?? ""}`.trim()}
    >
      <path
        d="M16.4003 29.5997L23 23M23 23L29.5997 16.4003M23 23L16.4003 16.4003M23 23L29.5997 29.5997M2 23C2 11.402 11.402 2 23 2C34.598 2 44 11.402 44 23C44 34.598 34.598 44 23 44C11.402 44 2 34.598 2 23Z"
        stroke="currentColor"
        strokeWidth="4"
      />
    </svg>
  );
}
