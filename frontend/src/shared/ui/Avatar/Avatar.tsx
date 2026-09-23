import { useLayoutEffect, useRef, useState } from "react";
import type { HTMLAttributes, SyntheticEvent } from "react";

import { cx } from "../cx";
import styles from "./Avatar.module.css";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";
export type AvatarTone = "accent" | "violet" | "teal" | "neutral";
export type AvatarStatus = "online" | "busy" | "offline";

export interface AvatarProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  tone?: AvatarTone;
  status?: AvatarStatus;
  loading?: boolean;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase("ru-RU");
  return `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}`.toLocaleUpperCase("ru-RU");
}

export function Avatar({
  name,
  src,
  size = "md",
  tone = "accent",
  status,
  loading = false,
  className,
  ...props
}: AvatarProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageState, setImageState] = useState<"loading" | "loaded" | "error">(src ? "loading" : "error");
  const busy = loading || (Boolean(src) && imageState === "loading");
  const showImage = Boolean(src) && imageState === "loaded" && !loading;
  const showFallback = !busy && !showImage;

  useLayoutEffect(() => {
    if (!src) {
      setImageState("error");
      return;
    }

    setImageState("loading");
    const image = imageRef.current;
    if (image?.complete) {
      setImageState(image.naturalWidth > 0 ? "loaded" : "error");
    }
  }, [src]);

  function handleLoad(event: SyntheticEvent<HTMLImageElement>) {
    setImageState(event.currentTarget.naturalWidth > 0 ? "loaded" : "error");
  }

  return (
    <div
      {...props}
      className={cx(styles.avatar, styles[size], styles[tone], className)}
      role="img"
      aria-label={name}
      aria-busy={busy || undefined}
    >
      {src ? (
        <img
          ref={imageRef}
          className={cx(styles.image, showImage && styles.imageVisible)}
          src={src}
          alt=""
          onLoad={handleLoad}
          onError={() => setImageState("error")}
        />
      ) : null}
      {showFallback ? <span className={styles.fallback}>{getInitials(name)}</span> : null}
      {busy ? <span className={styles.skeleton} aria-hidden="true" /> : null}
      {status ? <span className={cx(styles.status, styles[`status-${status}`])} aria-hidden="true" /> : null}
    </div>
  );
}
