import { useId } from "react";
import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "../cx";
import styles from "./ActionPreview.module.css";

export interface ActionPreviewProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  items: ReactNode[];
  note?: ReactNode;
  actions?: ReactNode;
}

export function ActionPreview({
  title = "Что произойдёт, если подтвердить",
  items,
  note,
  actions,
  className,
  ...props
}: ActionPreviewProps) {
  const titleId = useId();

  return (
    <div {...props} className={cx(styles.preview, className)} role="group" aria-labelledby={titleId}>
      <strong className={styles.title} id={titleId}>{title}</strong>
      <ul className={styles.list}>
        {items.map((item, index) => <li key={index}>{item}</li>)}
      </ul>
      {note ? <div className={styles.note}>{note}</div> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
