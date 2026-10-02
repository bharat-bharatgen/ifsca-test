"use client";
import { Dialog as Primitive } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import { Button as BaseButton } from "@base-ui/react/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
export function Button({ variant, size, className, ...props }) { return <BaseButton className={cn(buttonVariants({ variant, size }), className)} {...props} />; }
export const Dialog = Primitive.Root;
export const DialogTitle = Primitive.Title;
export function DialogContent({ className, children, blurOverlay, ...props }) {
  return <Primitive.Portal><Primitive.Backdrop className="fixed inset-0 z-50 bg-black/40" /><Primitive.Popup className={cn("chat-workspace fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border bg-background p-6 shadow-lg max-h-[90dvh] overflow-y-auto", className)} {...props}>{children}<Primitive.Close aria-label="Close dialog" className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-md hover:bg-muted"><X className="size-4" /></Primitive.Close></Primitive.Popup></Primitive.Portal>;
}
export function DialogFooter({ children }) { return <div className="flex justify-end gap-2">{children}</div>; }
export const DropdownMenu = Menu.Root;
export function DropdownMenuTrigger({ children }) { return <Menu.Trigger render={children} />; }
export function DropdownMenuContent({ children, align = "end" }) { return <Menu.Portal><Menu.Positioner sideOffset={4} align={align} className="z-50"><Menu.Popup className="chat-workspace min-w-36 rounded-xl border bg-popover p-1 text-popover-foreground shadow-md">{children}</Menu.Popup></Menu.Positioner></Menu.Portal>; }
export function DropdownMenuItem({ className, ...props }) { return <Menu.Item className={cn("flex cursor-default items-center rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent", className)} {...props} />; }
export const Sheet = Primitive.Root;
export function SheetTrigger({ children }) { return <Primitive.Trigger render={children} />; }
export const SheetTitle = Primitive.Title;
export function SheetContent({ children, className }) { return <Primitive.Portal><Primitive.Backdrop className="fixed inset-0 z-50 bg-black/40" /><Primitive.Popup className={cn("chat-workspace fixed inset-y-0 left-0 z-50 h-dvh w-[min(90vw,360px)] border-r shadow-lg", className)}>{children}<Primitive.Close aria-label="Close conversations" className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-md hover:bg-muted"><X className="size-4" /></Primitive.Close></Primitive.Popup></Primitive.Portal>; }
