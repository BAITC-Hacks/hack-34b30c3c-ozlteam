import { Select } from "../ui/FormControls";
import { useI18n } from "./I18nContext";
import type { Locale } from "./I18nContext";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <Select
      label={t("Язык", "Тіл", "Language")}
      value={locale}
      onChange={(event) => setLocale(event.target.value as Locale)}
      wrapperClassName={className}
    >
      <option value="ru">Русский</option>
      <option value="kk">Қазақша</option>
      <option value="en">English</option>
    </Select>
  );
}
