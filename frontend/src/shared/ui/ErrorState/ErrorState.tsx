import type { HTMLAttributes, ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "../Button/Button";
import { cx } from "../cx";
import styles from "./ErrorState.module.css";

export interface ErrorStateProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title" | "onError"> {
  /** Что случилось. Конкретно: «Не удалось загрузить отправку». */
  text: ReactNode;
  /** Повторная попытка. Ошибка всегда даёт выход. */
  onRetry: () => void;
  /** Заголовок над текстом. */
  title?: ReactNode;
  /** Подпись кнопки повтора. */
  retryLabel?: string;
  /** Повтор в процессе: спиннер на кнопке. */
  retrying?: boolean;
}

export function ErrorState({
  text,
  onRetry,
  title = "Что-то пошло не так",
  retryLabel = "Повторить",
  retrying = false,
  className,
  ...rest
}: ErrorStateProps) {
  return (
    <div {...rest} role="alert" className={cx(styles.state, className)}>
      <span className={styles.icon} aria-hidden="true">
        <AlertCircle size={20} strokeWidth={1.8} />
      </span>
      <h4 className={styles.title}>{title}</h4>
      <p className={styles.text}>{text}</p>
      <div className={styles.action}>
        <Button
          variant="secondary"
          size="sm"
          loading={retrying}
          onClick={onRetry}
        >
          {retryLabel}
        </Button>
      </div>
    </div>
  );
}
