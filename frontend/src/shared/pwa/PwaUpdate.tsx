import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "../ui/Button";

export function PwaUpdate() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <aside className="pwa-update" role="status">
      Доступна новая версия приложения.
      <Button onClick={() => void updateServiceWorker(true)}>Обновить</Button>
      <Button onClick={() => setNeedRefresh(false)}>Позже</Button>
    </aside>
  );
}
