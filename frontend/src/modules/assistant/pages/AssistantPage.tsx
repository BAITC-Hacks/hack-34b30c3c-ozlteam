import { useState } from "react";
import { PageHeader } from "../../../app/PageHeader";
import { useI18n } from "../../../shared/i18n/I18nContext";
import { Switch } from "../../../shared/ui";
import { AssistantWorkspace } from "../components/AssistantWorkspace";
import styles from "./AssistantPage.module.css";

export function AssistantPage() {
  const { t } = useI18n();
  const [background, setBackground] = useState(() => {
    try { return localStorage.getItem("assistant-background") !== "off"; } catch { return true; }
  });
  return <div className={styles.page} data-assistant-page={background ? "decorated" : "plain"}>
    <PageHeader title={<span className={styles.visuallyHidden}>{t("Помощник", "Көмекші", "Assistant")}</span>} actions={<Switch label={t("Фон", "Фон", "Background")} aria-label={t("Показывать фон помощника", "Көмекші фонын көрсету", "Show assistant background")} className={styles.backgroundSwitch} checked={background} onChange={(event) => {
      setBackground(event.target.checked);
      try { localStorage.setItem("assistant-background", event.target.checked ? "on" : "off"); } catch { /* Only a visual preference, no private content. */ }
    }} />} />
    <AssistantWorkspace />
  </div>;
}
