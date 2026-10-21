import type { SVGProps } from "react";

export function ErrorIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
      className={`idkit-error-svg ${props.className ?? ""}`.trim()}
    >
      <path
        d="M27.9987 49.0171C39.5959 49.0171 48.9973 39.6139 48.9973 28.0144C48.9973 16.4149 39.5959 7.01172 27.9987 7.01172C16.4014 7.01172 7 16.4149 7 28.0144C7 39.6139 16.4014 49.0171 27.9987 49.0171Z"
        stroke="currentColor"
        strokeWidth="4"
        strokeMiterlimit="10"
      />
      <path
        d="M13.1432 42.8588L42.0019 13.998"
        stroke="currentColor"
        strokeWidth="4"
        strokeMiterlimit="10"
      />
    </svg>
  );
}
