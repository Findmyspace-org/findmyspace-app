import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "fms-v2-button fms-v2-button-primary",
  secondary: "fms-v2-button fms-v2-button-secondary",
  ghost: "fms-v2-button fms-v2-button-ghost",
};

export function V2Button({
  children,
  className,
  href,
  variant = "primary",
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  href?: string;
  variant?: ButtonVariant;
}) {
  const classes = cx(BUTTON_VARIANTS[variant], className);

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...buttonProps}>
      {children}
    </button>
  );
}

export function V2IconButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  "aria-label": string;
}) {
  return (
    <button className={cx("fms-v2-icon-button", className)} {...props}>
      {children}
    </button>
  );
}

export function V2Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("fms-v2-container", className)}>{children}</div>
  );
}

export function V2Section({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("fms-v2-section", className)}>{children}</section>
  );
}

export function V2PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="fms-v2-page-heading">
      {eyebrow ? <p className="fms-v2-eyebrow">{eyebrow}</p> : null}
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function V2Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("fms-v2-input", className)} {...props} />;
}

export function V2Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("fms-v2-card", className)}>{children}</div>;
}

export function V2Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "success";
}) {
  return (
    <span className={cx("fms-v2-badge", `fms-v2-badge-${tone}`)}>
      {children}
    </span>
  );
}
