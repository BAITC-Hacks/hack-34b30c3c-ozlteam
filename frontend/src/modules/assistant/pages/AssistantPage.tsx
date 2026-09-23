import { useState } from "react";
import { PageHeader } from "../../../app/PageHeader";
import { Switch } from "../../../shared/ui";
import { AssistantWorkspace } from "../components/AssistantWorkspace";
import styles from "./AssistantPage.module.css";

export function AssistantPage() {
  const [background, setBackground] = useState(() => {
    try { return localStorage.getItem("assistant-background") !== "off"; } catch { return true; }
  });
  return <div className={styles.page} data-assistant-page={background ? "decorated" : "plain"}>
    <PageHeader title={<span className={styles.visuallyHidden}>Помощник</span>} actions={<Switch label="Фон" aria-label="Показывать фон помощника" className={styles.backgroundSwitch} checked={background} onChange={(event) => {
      setBackground(event.target.checked);
      try { localStorage.setItem("assistant-background", event.target.checked ? "on" : "off"); } catch { /* Only a visual preference, no private content. */ }
    }} />} />
    <AssistantWorkspace />
  </div>;
}
