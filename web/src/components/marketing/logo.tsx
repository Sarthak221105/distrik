import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/distrik-mark.png"
      alt="Distrik mark"
      width={40}
      height={38}
      className={cn("size-6 sm:size-7 shrink-0 object-contain", className)}
      priority
    />
  );
}

export function LogoImage({
  className,
  variant = "dark",
}: {
  className?: string;
  variant?: "dark" | "white";
}) {
  return (
    <Image
      src={variant === "white" ? "/distrik-logo-white.png" : "/distrik-logo.png"}
      alt="Distrik"
      width={160}
      height={54}
      className={cn("h-8 sm:h-9 w-auto object-contain", className)}
      priority
    />
  );
}

export function Logo({
  className,
  variant = "dark",
}: {
  className?: string;
  variant?: "dark" | "white";
}) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center transition-opacity duration-200 hover:opacity-90 active:scale-95",
        className,
      )}
      aria-label="Distrik home"
    >
      <LogoImage variant={variant} />
    </Link>
  );
}
