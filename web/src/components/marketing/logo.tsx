import Link from "next/link";
import { useId } from "react";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 512 512" aria-hidden className={cn("size-7 shrink-0", className)}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2851eb" />
          <stop offset="1" stopColor="#6c84fc" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill={`url(#${id})`} />
      <path
        d="M160 128h96c88 0 144 52 144 128s-56 128-144 128h-96z"
        fill="none"
        stroke="#ffffff"
        strokeWidth="48"
        strokeLinejoin="round"
      />
      <circle cx="352" cy="384" r="24" fill="#373868" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("inline-flex items-center gap-2 rounded-md font-display text-xl font-medium tracking-tight", className)}
      aria-label="Distrik home"
    >
      <LogoMark />
      <span>Distrik</span>
    </Link>
  );
}
