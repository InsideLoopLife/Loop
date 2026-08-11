"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ModalFrame } from "@/components/ui/ModalFrame";

export function SavingsAccountModalShell({
  trigger,
  title,
  subtitle,
  children,
  triggerClassName = "",
}: {
  trigger: ReactNode;
  title: string;
  subtitle?: string | null;
  children: ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const modal = open ? (
    <ModalFrame title={title} description={subtitle} eyebrow="Savings account" onClose={() => setOpen(false)}>
      {children}
    </ModalFrame>
  ) : null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
        {trigger}
      </button>
      {mounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
