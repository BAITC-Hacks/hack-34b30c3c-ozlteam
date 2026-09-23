import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";
import styles from "./Card.module.css";

export interface CardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Заголовок карточки, 14/600. */
  title?: ReactNode;
  /** Пояснение под заголовком, цвет --mut. */
  subtitle?: ReactNode;
  /** Контролы справа от заголовка. */
  actions?: ReactNode;
  /** Внутренний отступ --pad-card. По умолчанию включён. */
  padded?: boolean;
  /** Подъём на 2 px и тень --sh-2 при наведении — для кликабельных блоков. */
  lift?: boolean;
  children?: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    title,
    subtitle,
    actions,
    padded = true,
    lift = false,
    className,
    children,
    ...rest
  },
  ref,
) {
  const hasHead = title !== undefined || subtitle !== undefined || actions !== undefined;

  return (
    <div
      {...rest}
      ref={ref}
      className={cx(
        styles.card,
        padded && styles.padded,
        lift && styles.lift,
        className,
      )}
    >
      {hasHead ? (
        <div className={cx(styles.head, !padded && styles.headBare)}>
          {title !== undefined || subtitle !== undefined ? (
            <div className={styles.titles}>
              {title !== undefined ? (
                <h3 className={styles.title}>{title}</h3>
              ) : null}
              {subtitle !== undefined ? (
                <p className={styles.subtitle}>{subtitle}</p>
              ) : null}
            </div>
          ) : null}
          {actions !== undefined ? (
            <div className={styles.actions}>{actions}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
});
