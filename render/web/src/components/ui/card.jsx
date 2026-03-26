import * as React from "react"
import { cn } from "@/lib/utils"

const cardSizes = {
  default: "p-6",
  sm: "p-4",
}

const Card = React.forwardRef(({ className, size = "default", ...props }, ref) => (
  <div
    ref={ref}
    className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 pt-6 pb-0 [.border-b_+_&]:pt-6 has-data-[slot=card-action]:grid-cols-[1fr_auto]", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("leading-none font-semibold", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardAction = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card-action"
    className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
    {...props}
  />
))
CardAction.displayName = "CardAction"

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("px-6 py-6", className)}
    {...props}
  />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center px-6 pb-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter }
