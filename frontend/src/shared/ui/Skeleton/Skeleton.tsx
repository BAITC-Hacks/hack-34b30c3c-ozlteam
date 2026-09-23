import type { CSSProperties } from "react";
import styles from "./Skeleton.module.css";

export function Skeleton({ width = "100%", height = "1em", className = "" }: { width?: CSSProperties["width"]; height?: CSSProperties["height"]; className?: string }) {
  return <span aria-hidden="true" className={`${styles.root} ${className}`} style={{ width, height }} />;
}
