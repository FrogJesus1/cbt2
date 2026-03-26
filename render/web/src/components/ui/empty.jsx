import * as React from "react"
import { cn } from "@/lib/utils"

const Empty = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col items-center justify-center gap-6 p-10 text-center",
      className
    )}
    {...props}
  />
))
Empty.displayName = "Empty"

const EmptyHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col items-center gap-2", className)}
    {...props}
  />
))
EmptyHeader.displayName = "EmptyHeader"

const EmptyMedia = React.forwardRef(({ className, variant = "default", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center justify-center",
      variant === "icon" &&
        "size-12 rounded-full border bg-muted text-muted-foreground [&_svg]:size-5",
      className
    )}
    {...props}
  />
))
EmptyMedia.displayName = "EmptyMedia"

const EmptyTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-base font-semibold text-foreground", className)}
    {...props}
  />
))
EmptyTitle.displayName = "EmptyTitle"

const EmptyDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
EmptyDescription.displayName = "EmptyDescription"

const EmptyContent = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col items-center gap-2", className)}
    {...props}
  />
))
EmptyContent.displayName = "EmptyContent"

export {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
}
