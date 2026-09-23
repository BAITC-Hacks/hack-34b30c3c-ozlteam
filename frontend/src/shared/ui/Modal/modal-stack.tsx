import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { ReactNode, RefObject } from "react";

import styles from "./Modal.module.css";

export type ModalCloseReason = "close-button" | "backdrop" | "escape" | "programmatic";

interface Registration {
  panel: RefObject<HTMLElement | null>;
  isOpen: () => boolean;
  closeOnEscape: () => boolean;
  requestOpen: () => void;
  requestClose: (reason: ModalCloseReason) => void;
}

interface Entry {
  id: string;
  payload?: unknown;
  opener: HTMLElement | null;
  lastFocused: HTMLElement | null;
}

export interface ModalStack {
  activeId: string | null;
  stackIds: string[];
  depth: number;
  open: <T = unknown>(id: string, payload?: T) => boolean;
  close: (id?: string) => boolean;
  back: () => boolean;
  closeAll: () => void;
  payloadFor: <T = unknown>(id: string) => T | undefined;
}

interface ModalStackContextValue extends ModalStack {
  register: (id: string, registration: Registration) => () => void;
  activate: (id: string) => void;
  deactivate: (id: string) => void;
  isTop: (id: string) => boolean;
  isStacked: (id: string) => boolean;
  indexOf: (id: string) => number;
  requestClose: (id: string, reason: ModalCloseReason) => boolean;
}

const StackContext = createContext<ModalStackContextValue | null>(null);
const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable=true]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function activeElement() {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

function focusableElements(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => !element.hidden && element.getClientRects().length > 0,
  );
}

export function ModalProvider({ children }: { children: ReactNode }) {
  const registrations = useRef(new Map<string, Registration>());
  const pendingPayloads = useRef(new Map<string, unknown>());
  const entriesRef = useRef<Entry[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [revision, setRevision] = useState(0);

  const commit = useCallback((next: Entry[]) => {
    entriesRef.current = next;
    setEntries(next);
  }, []);

  const focusEntry = useCallback((entry: Entry, restore = false) => {
    window.requestAnimationFrame(() => {
      const panel = registrations.current.get(entry.id)?.panel.current;
      if (!panel) return;
      if (restore && entry.lastFocused?.isConnected && panel.contains(entry.lastFocused)) {
        entry.lastFocused.focus({ preventScroll: true });
        return;
      }
      const target =
        panel.querySelector<HTMLElement>("[autofocus]") ??
        focusableElements(panel)[0] ??
        panel;
      target.focus({ preventScroll: true });
    });
  }, []);

  const activate = useCallback((id: string) => {
    if (!registrations.current.has(id)) return;
    const currentEntries = entriesRef.current;
    const current = currentEntries.at(-1);
    const hasPayload = pendingPayloads.current.has(id);
    const payload = pendingPayloads.current.get(id);
    pendingPayloads.current.delete(id);
    if (current?.id === id) {
      if (hasPayload) {
        current.payload = payload;
        setRevision((value) => value + 1);
      }
      return;
    }
    const focused = activeElement();
    if (current && registrations.current.get(current.id)?.panel.current?.contains(focused)) {
      current.lastFocused = focused;
    }
    const existing = currentEntries.find((entry) => entry.id === id);
    const entry = existing ?? { id, opener: focused, lastFocused: null };
    if (hasPayload) entry.payload = payload;
    commit([...currentEntries.filter((candidate) => candidate.id !== id), entry]);
    focusEntry(entry, Boolean(existing));
  }, [commit, focusEntry]);

  const deactivate = useCallback((id: string) => {
    const currentEntries = entriesRef.current;
    const index = currentEntries.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const removed = currentEntries[index]!;
    const wasTop = index === currentEntries.length - 1;
    const focused = activeElement();
    const panel = registrations.current.get(id)?.panel.current;
    if (focused && panel?.contains(focused)) focused.blur();
    const next = currentEntries.filter((entry) => entry.id !== id);
    commit(next);
    if (!wasTop) return;
    const previous = next.at(-1);
    if (previous) focusEntry(previous, true);
    else window.requestAnimationFrame(() => removed.opener?.focus({ preventScroll: true }));
  }, [commit, focusEntry]);

  const register = useCallback((id: string, registration: Registration) => {
    if (registrations.current.has(id) && import.meta.env.DEV) {
      console.warn(`[Modal] Duplicate id "${id}".`);
    }
    registrations.current.set(id, registration);
    return () => {
      if (registrations.current.get(id) !== registration) return;
      deactivate(id);
      registrations.current.delete(id);
    };
  }, [deactivate]);

  const requestClose = useCallback((id: string, reason: ModalCloseReason) => {
    const current = entriesRef.current.at(-1);
    const registration = registrations.current.get(id);
    if (!current || current.id !== id || !registration) return false;
    registration.requestClose(reason);
    return true;
  }, []);

  const open = useCallback(<T,>(id: string, payload?: T) => {
    const registration = registrations.current.get(id);
    if (!registration) {
      if (import.meta.env.DEV) console.warn(`[Modal] Cannot open unknown id "${id}".`);
      return false;
    }
    pendingPayloads.current.set(id, payload);
    setRevision((value) => value + 1);
    registration.requestOpen();
    return true;
  }, []);

  const close = useCallback((id?: string) => {
    const current = entriesRef.current.at(-1);
    if (!current || (id && current.id !== id)) return false;
    return requestClose(current.id, "programmatic");
  }, [requestClose]);

  const closeAll = useCallback(() => {
    const currentEntries = [...entriesRef.current];
    if (!currentEntries.length) return;
    const rootOpener = currentEntries[0]?.opener;
    commit([]);
    currentEntries.reverse().forEach((entry) => {
      registrations.current.get(entry.id)?.requestClose("programmatic");
    });
    window.requestAnimationFrame(() => {
      if (rootOpener?.isConnected) rootOpener.focus({ preventScroll: true });
    });
  }, [commit]);

  const back = useCallback(() => close(), [close]);

  const hasOpenModal = entries.length > 0;
  useLayoutEffect(() => {
    if (!hasOpenModal) return;
    const body = document.body;
    const overflow = body.style.overflow;
    const paddingRight = body.style.paddingRight;
    const scrollbar = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    const padding = Number.parseFloat(getComputedStyle(body).paddingRight) || 0;
    body.style.overflow = "hidden";
    if (scrollbar) body.style.paddingRight = `${padding + scrollbar}px`;
    return () => {
      body.style.overflow = overflow;
      body.style.paddingRight = paddingRight;
    };
  }, [hasOpenModal]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      const current = entriesRef.current.at(-1);
      if (!current) return;
      const registration = registrations.current.get(current.id);
      const panel = registration?.panel.current;
      if (event.key === "Escape" && registration?.isOpen() && registration.closeOnEscape()) {
        event.preventDefault();
        requestClose(current.id, "escape");
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = focusableElements(panel);
      if (!items.length) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const focused = activeElement();
      const first = items[0]!;
      const last = items.at(-1) ?? first;
      if (event.shiftKey && (focused === first || !panel.contains(focused))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (focused === last || !panel.contains(focused))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }
    document.addEventListener("keydown", handleKeydown, true);
    return () => document.removeEventListener("keydown", handleKeydown, true);
  }, [requestClose]);

  const value = useMemo<ModalStackContextValue>(() => {
    const stackIds = entries.map((entry) => entry.id);
    const activeId = stackIds.at(-1) ?? null;
    return {
      activeId,
      stackIds,
      depth: entries.length,
      open,
      close,
      back,
      closeAll,
      payloadFor: <T,>(id: string) =>
        (entries.find((entry) => entry.id === id)?.payload ?? pendingPayloads.current.get(id)) as T | undefined,
      register,
      activate,
      deactivate,
      isTop: (id) => activeId === id,
      isStacked: (id) => stackIds.includes(id),
      indexOf: (id) => stackIds.indexOf(id),
      requestClose,
    };
  }, [activate, back, close, closeAll, deactivate, entries, open, register, requestClose, revision]);

  return (
    <StackContext.Provider value={value}>
      <div className={styles.providerContent} aria-hidden={hasOpenModal || undefined} inert={hasOpenModal || undefined}>
        {children}
      </div>
      {hasOpenModal
        ? createPortal(<div className={styles.backdrop} aria-hidden="true" />, document.body)
        : null}
    </StackContext.Provider>
  );
}

export function useModalStack(): ModalStack {
  return useModalStackContext();
}

export function useModalStackContext(): ModalStackContextValue {
  const stack = useContext(StackContext);
  if (!stack) throw new Error("useModalStack() must be used below <ModalProvider>.");
  return stack;
}
