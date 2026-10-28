import Link from "next/link";
import type { ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonStyle {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

// The global .button classes (globals.css) are the single button style; these
// components only pick the classes. A primary, medium button is exactly
// class="button", so older screens and their tests read the same markup.
export function buttonClass({ variant = "primary", size = "md", block = false }: ButtonStyle = {}) {
  return [
    "button",
    variant !== "primary" && `button-${variant}`,
    size !== "md" && `button-${size}`,
    block && "button-block",
  ]
    .filter(Boolean)
    .join(" ");
}

function join(a: string, b?: string) {
  return b ? `${a} ${b}` : a;
}

export function Button({
  variant,
  size,
  block,
  className,
  type = "button",
  ...props
}: ButtonStyle & ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={join(buttonClass({ variant, size, block }), className)}
      {...props}
    />
  );
}

// A link that looks like a button: for actions that open a page ("Kayıt
// olun", "Örnek bahçeyi gezin").
export function ButtonLink({
  variant,
  size,
  block,
  className,
  ...props
}: ButtonStyle & ComponentProps<typeof Link>) {
  return <Link className={join(buttonClass({ variant, size, block }), className)} {...props} />;
}
