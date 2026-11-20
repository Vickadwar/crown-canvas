/**
 * @file src/components/ui/button.tsx
 * @description Vercel/Linear-inspired minimalist button primitives powered by
 * `@base-ui/react/button` with Obsidian Black primary actions and crisp hairline outlines.
 */

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-zinc-950/20 focus-visible:ring-offset-1 active:not-aria-[haspopup]:scale-[0.985] disabled:pointer-events-none disabled:opacity-45 dark:focus-visible:ring-zinc-100/25 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-zinc-950 text-white shadow-2xs hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200",
        brand:
          "bg-zinc-950 text-white font-medium shadow-xs hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200",
        accent:
          "bg-blue-600 text-white font-medium shadow-xs hover:bg-blue-700",
        outline:
          "border-zinc-200 bg-white text-zinc-800 shadow-2xs hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 aria-expanded:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-900",
        secondary:
          "border-zinc-200/70 bg-zinc-100 text-zinc-900 hover:bg-zinc-200/80 aria-expanded:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
        ghost:
          "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 aria-expanded:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100",
        destructive:
          "border-red-200 bg-white text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-red-900/60 dark:bg-zinc-950 dark:text-red-400 dark:hover:bg-red-950/40",
        link: "text-blue-600 underline-offset-4 hover:underline dark:text-blue-400",
      },
      size: {
        default: "h-9 gap-2 px-3.5 text-sm",
        xs: "h-7 gap-1.5 rounded-md px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1.5 rounded-lg px-3 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 rounded-lg px-4.5 text-sm",
        icon: "size-9",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8 rounded-lg",
        "icon-lg": "size-10 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
