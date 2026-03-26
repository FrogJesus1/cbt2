import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

const itemVariants = {
  default: "",
  outline: "border rounded-lg",
  muted: "bg-muted rounded-lg",
}

const itemSizes = {
  default: "px-4 py-3 gap-3",
  sm: "px-3 py-2 gap-2",
  xs: "px-2 py-1.5 gap-2",
}

const Item = React.forwardRef(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "div"
    return (
      <Comp
        ref={ref}
        className={cn(
          "flex w-full items-center",
          itemVariants[variant],
          itemSizes[size],
          asChild && "hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors cursor-pointer",
          className
        )}
        {...props}
      />
    )
  }
)
Item.displayName = "Item"

const ItemGroup = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col", className)}
    {...props}
  />
))
ItemGroup.displayName = "ItemGroup"

const ItemSeparator = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("h-px bg-border mx-4", className)}
    {...props}
  />
))
ItemSeparator.displayName = "ItemSeparator"

const ItemMedia = React.forwardRef(({ className, variant = "default", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex shrink-0 items-center justify-center",
      variant === "icon" &&
        "size-9 rounded-md border bg-muted text-muted-foreground [&_svg]:size-4",
      variant === "image" &&
        "size-10 overflow-hidden rounded-md [&_img]:h-full [&_img]:w-full [&_img]:object-cover",
      className
    )}
    {...props}
  />
))
ItemMedia.displayName = "ItemMedia"

const ItemContent = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)}
    {...props}
  />
))
ItemContent.displayName = "ItemContent"

const ItemTitle = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("truncate text-sm font-medium leading-none text-foreground", className)}
    {...props}
  />
))
ItemTitle.displayName = "ItemTitle"

const ItemDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("truncate text-sm text-muted-foreground", className)}
    {...props}
  />
))
ItemDescription.displayName = "ItemDescription"

const ItemActions = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex shrink-0 items-center gap-2", className)}
    {...props}
  />
))
ItemActions.displayName = "ItemActions"

const ItemHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("px-4 py-2 text-xs font-medium text-muted-foreground", className)}
    {...props}
  />
))
ItemHeader.displayName = "ItemHeader"

const ItemFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("px-4 py-2 text-xs text-muted-foreground", className)}
    {...props}
  />
))
ItemFooter.displayName = "ItemFooter"

export {
  Item,
  ItemGroup,
  ItemSeparator,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemHeader,
  ItemFooter,
}
