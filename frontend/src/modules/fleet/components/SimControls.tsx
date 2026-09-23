import {
  AlertTriangle,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Snowflake,
  Split,
  Stamp,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button, Chip, Segmented } from "../../../shared/ui";
import { MANUAL_STEP, RATES } from "../hooks/useFleetSim";
import type { SimMode } from "../hooks/useFleetSim";
import type { EventKind } from "../types";
import styles from "./SimControls.module.css";
import { useI18n } from "../../../shared/i18n/I18nContext";

/**
 * Что ведущий может подбросить рейсу руками. Список короткий намеренно: это
 * репертуар демонстрации, а не редактор событий — каждое должно вести к разбору,
 * который интересно слушать.
 */
const TROUBLES: { kind: EventKind; label: string; icon: ReactNode }[] = [
  { kind: "speeding", label: "Превышение", icon: <AlertTriangle size={14} strokeWidth={1.8} /> },
  { kind: "customs", label: "Держат декларацию", icon: <Stamp size={14} strokeWidth={1.8} /> },
  { kind: "breakdown", label: "Поломка", icon: <Wrench size={14} strokeWidth={1.8} /> },
  { kind: "detour", label: "Объезд", icon: <Split size={14} strokeWidth={1.8} /> },
  { kind: "coldChain", label: "Режим охлаждения", icon: <Snowflake size={14} strokeWidth={1.8} /> },
];

export interface SimControlsProps {
  playing: boolean;
  mode: SimMode;
  rate: number;
  focused: boolean;
  /** Рейс не выбран или уже завершён: управлять нечем. */
  disabled: boolean;
  onToggle: () => void;
  onStep: () => void;
  onReset: () => void;
  onMode: (mode: SimMode) => void;
  onRate: (rate: number) => void;
  onFocus: (focused: boolean) => void;
  onFire: (kind: EventKind) => void;
}

export function SimControls({
  playing,
  mode,
  rate,
  focused,
  disabled,
  onToggle,
  onStep,
  onReset,
  onMode,
  onRate,
  onFocus,
  onFire,
}: SimControlsProps) {
  const { t } = useI18n();
  const auto = mode === "auto";

  return (
    <div className={styles.bar}>
      <div className={styles.group}>
        <Segmented
          ariaLabel={t("Режим демонстрации", "Демо режимі", "Demo mode")}
          value={mode}
          onValueChange={(value) => onMode(value as SimMode)}
          items={[
            { value: "auto", label: t("Авто", "Авто", "Auto") },
            { value: "manual", label: t("Ручной", "Қолмен", "Manual") },
          ]}
        />

        {auto ? (
          <Button
            variant="dark"
            icon={playing ? <Pause size={15} strokeWidth={2} /> : <Play size={15} strokeWidth={2} />}
            onClick={onToggle}
          >
            {playing ? t("Пауза", "Үзіліс", "Pause") : t("Запустить", "Бастау", "Start")}
          </Button>
        ) : (
          <Button
            variant="dark"
            icon={<SkipForward size={15} strokeWidth={2} />}
            onClick={onStep}
            disabled={disabled}
          >
            {t("Шаг", "Қадам", "Step")} {MANUAL_STEP} {t("мин", "мин", "min")}
          </Button>
        )}

        {auto ? (
          <Segmented
            ariaLabel={t("Скорость демонстрации", "Демо жылдамдығы", "Demo speed")}
            value={String(rate)}
            onValueChange={(value) => onRate(Number(value))}
            items={RATES.map((value) => ({ value: String(value), label: `×${value / 10}` }))}
          />
        ) : null}

        <Button variant="ghost" icon={<RotateCcw size={15} strokeWidth={1.8} />} onClick={onReset}>
          {t("Сначала", "Басынан", "Restart")}
        </Button>
      </div>

      <div className={styles.group}>
        <span className={styles.caption}>{t("Подбросить событие", "Оқиға қосу", "Trigger event")}</span>
        {TROUBLES.map((trouble) => (
          <Chip key={trouble.kind} onClick={() => onFire(trouble.kind)} disabled={disabled}>
            <span className={styles.chip}>
              <span className={styles.chipIcon} aria-hidden="true">
                {trouble.icon}
              </span>
              {trouble.kind === "speeding" ? t("Превышение", "Жылдамдықты асыру", "Speeding") : trouble.kind === "customs" ? t("Держат декларацию", "Декларация ұсталды", "Customs hold") : trouble.kind === "breakdown" ? t("Поломка", "Ақау", "Breakdown") : trouble.kind === "detour" ? t("Объезд", "Айналма жол", "Detour") : t("Режим охлаждения", "Салқындату режимі", "Cooling issue")}
            </span>
          </Chip>
        ))}
      </div>

      <div className={styles.tail}>
        <Button
          variant="secondary"
          size="sm"
          icon={focused ? <Minimize2 size={14} strokeWidth={1.8} /> : <Maximize2 size={14} strokeWidth={1.8} />}
          onClick={() => onFocus(!focused)}
        >
          {focused ? t("Весь регион", "Бүкіл аймақ", "Whole region") : t("К рейсу", "Рейске", "To trip")}
        </Button>
      </div>
    </div>
  );
}
