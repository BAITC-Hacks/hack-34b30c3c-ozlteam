import { X } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

import { cx } from "../cx";
import styles from "./Modal.module.css";
import { type ModalCloseReason, useModalStackContext } from "./modal-stack";

export type ModalSize = "sm" | "md" | "lg";

export interface ModalProps {
  id: string;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean, reason?: ModalCloseReason) => void;
  onClose?: (reason: ModalCloseReason) => void;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  showClose?: boolean;
  bodyScroll?: boolean;
  size?: ModalSize;
  className?: string;
}

const closeDuration = 180;

export function Modal({
  id,
  title,
  children,
  footer,
  open,
  defaultOpen = false,
  onOpenChange,
  onClose,
  closeOnEscape = true,
  closeOnBackdrop = true,
  showClose = true,
  bodyScroll = false,
  size = "md",
  className,
}: ModalProps) {
  const stack = useModalStackContext();
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [retained, setRetained] = useState(open ?? defaultOpen);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const titleId = `modal-title-${useId().replaceAll(":", "")}`;
  const controlled = open !== undefined;
  const isOpen = controlled ? open : uncontrolledOpen;
  const propsRef = useRef({ controlled, isOpen, closeOnEscape, onOpenChange, onClose });
  propsRef.current = { controlled, isOpen, closeOnEscape, onOpenChange, onClose };

  const changeOpen = useCallback((nextOpen: boolean, reason?: ModalCloseReason) => {
    if (!propsRef.current.controlled) setUncontrolledOpen(nextOpen);
    propsRef.current.onOpenChange?.(nextOpen, reason);
    if (!nextOpen && reason) propsRef.current.onClose?.(reason);
  }, []);

  useLayoutEffect(
    () =>
      stack.register(id, {
        panel: panelRef,
        isOpen: () => propsRef.current.isOpen,
        closeOnEscape: () => propsRef.current.closeOnEscape,
        requestOpen: () => changeOpen(true),
        requestClose: (reason) => changeOpen(false, reason),
      }),
    [changeOpen, id, stack.register],
  );

  useLayoutEffect(() => {
    window.clearTimeout(closeTimer.current);
    const currentStack = stackRef.current;
    if (isOpen) {
      setRetained(true);
      setClosing(false);
      currentStack.activate(id);
      return;
    }
    if (!currentStack.isStacked(id)) {
      setRetained(false);
      setClosing(false);
      return;
    }
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      stackRef.current.deactivate(id);
      setClosing(false);
      setRetained(false);
    }, closeDuration);
    return () => window.clearTimeout(closeTimer.current);
  }, [id, isOpen]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  if (!retained) return null;

  const isTop = stack.isTop(id);
  const state = closing ? "closing" : isTop ? "open" : "parked";
  const depth = Math.max(0, stack.indexOf(id));

  function requestClose(reason: ModalCloseReason) {
    if (reason === "backdrop" && !closeOnBackdrop) return;
    stackRef.current.requestClose(id, reason);
  }

  function handleBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) requestClose("backdrop");
  }

  return createPortal(
    <div
      className={styles.layer}
      style={{ "--modal-depth": depth } as CSSProperties}
      data-state={state}
      hidden={!isTop}
      aria-hidden={!isTop || undefined}
      inert={!isTop || closing || undefined}
      onMouseDown={handleBackdrop}
    >
      <section
        ref={panelRef}
        className={cx(styles.panel, styles[size], bodyScroll && styles.bodyScroll, className)}
        data-state={state}
        role="dialog"
        aria-modal={isTop || undefined}
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className={styles.header}>
          <h2 id={titleId}>{title}</h2>
          {showClose ? (
            <button
              className={styles.closeButton}
              type="button"
              aria-label="Закрыть"
              onClick={() => requestClose("close-button")}
            >
              <X size={17} strokeWidth={1.8} />
            </button>
          ) : null}
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}
