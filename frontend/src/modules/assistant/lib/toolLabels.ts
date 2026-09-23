const names: Record<string, string> = {
  search_help: "Поиск по справке",
  search_catalog: "Поиск в справочниках",
  resolve_supplier: "Уточнение поставщика",
  get_overview: "Обзор закупок",
  get_stock: "Проверка остатков",
  get_inbound: "Проверка ожидаемых поставок",
  list_runs: "Поиск расчётов",
  get_run: "Просмотр расчёта",
  list_recommendations: "Поиск рекомендаций",
  get_recommendation: "Проверка рекомендации",
  list_orders: "Поиск заказов",
  get_order: "Просмотр заказа",
  list_packages: "Поиск пакетов данных",
  get_package: "Проверка пакета данных",
  prepare_calculate: "Подготовка расчёта",
  prepare_create_orders: "Подготовка черновиков заказов",
  prepare_create_supplier_draft: "Подготовка черновика поставщику",
  prepare_create_test_supplier_draft: "Подготовка тестового заказа",
  prepare_apply_package: "Подготовка загрузки данных",
  calculate: "Запуск расчёта",
  create_orders: "Создание черновиков заказов",
  create_supplier_draft: "Создание черновика поставщику",
  create_test_supplier_draft: "Создание тестового черновика",
  apply_package: "Применение пакета данных",
  plan: "Проверка действия",
};

const statuses: Record<string, string> = {
  success: "Выполнено",
  error: "Не выполнено",
  confirmed: "Подтверждено",
  cancelled: "Отменено",
  pending: "Ожидает выполнения",
};

export function toolLabel(name: string): string { return names[name] ?? "Действие помощника"; }
export function toolStatusLabel(status: string): string { return statuses[status] ?? "Статус недоступен"; }
