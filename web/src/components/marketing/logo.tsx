import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/distrik-mark.png"
      alt="Distrik mark"
      width={30}
      height={28}
      className={cn("size-5 sm:size-5.5 shrink-0 object-contain", className)}
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
      width={120}
      height={40}
      className={cn("h-6 sm:h-7 w-auto object-contain", className)}
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
