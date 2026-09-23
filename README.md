# Hackalem · Hackathon starter

Модульный монорепозиторий: React SPA + FastAPI API + PostgreSQL с pgvector + опциональный Telegram-бот на aiogram 3. Рабочий пример Notes позволяет создавать, просматривать и удалять заметки через UI и API.

Этот файл — про заготовку и её запуск. Что мы делаем и для кого — в [CONTEXT.md](CONTEXT.md).

## Запуск одной командой

Нужен Docker с Compose v2 (Docker Desktop на Mac/Windows). Локальные Python, Node и PostgreSQL не нужны.

```sh
make dev
```

Первый запуск скачивает образы, устанавливает зависимости, запускает PostgreSQL, применяет Alembic и поднимает API и Vite. Команда запускает контейнеры в фоне. Логи: `make dev-logs`; состояние: `make dev-ps`; остановка с сохранением базы: `make dev-down`.

- Приложение: http://127.0.0.1:5173
- Swagger: http://127.0.0.1:7575/docs
- API: http://127.0.0.1:7575/api/v1/notes
- Готовность API/pgvector: http://127.0.0.1:7575/api/health/ready

### Окружения

- `.env.local.example` — отслеживаемый шаблон локальных настроек с development-паролем.
- `.env.local` — локальные настройки команды; создаётся автоматически при `make dev`, если файла ещё нет. Существующий файл не перезаписывается.
- `.env.production.example` — отдельный шаблон production с другим именем проекта/базы и пустыми секретами.
- `.env.production` — подготовленный файл для production. Перед использованием заполните пароль БД и, если нужен бот, токен. На новом checkout скопируйте его из `.env.production.example`.

Рабочие `.env.local` и `.env.production` исключены из Git; в репозитории хранятся только шаблоны. `.env.example` оставлен для совместимости, но команда разработки его не использует.

`make dev` вызывает `scripts/dev.sh`: он выбирает `.env.local` явным `--env-file`, поэтому корневой `.env` не подставляется случайно. Эквивалент после создания `.env.local`:

```sh
docker compose --env-file .env.local -f compose.yaml up --build -d
```

**Windows:** `.\scripts\dev.ps1 up --build -d` — тот же скрипт на PowerShell, так же сам создаёт `.env.local`. Make не нужен.

Без Make и без скриптов работает и прямой вызов, одинаковый на всех системах:

```sh
docker compose --env-file .env.local up --build -d
```

Без Make используйте `./scripts/dev.sh up --build -d`. Скрипт работает и при вызове по абсолютному пути из другого каталога. Экспортированные переменные оболочки имеют стандартный приоритет Compose над env-файлом; уберите одноимённые переменные из оболочки, если они перекрывают локальные настройки.

**`.env.production` задаёт только переменные.** Текущий `compose.yaml` остаётся окружением разработки с Vite и reload; production Compose и публичное развёртывание готовятся отдельно. Не запускайте его с production-секретами.

Изменение POSTGRES_USER/PASSWORD/DB не перенастраивает уже созданную базу в volume.

```sh
./scripts/dev.sh down  # остановить, сохранив базу
```

База в volume `postgres_data`, каталог для PostgreSQL 18 — `/var/lib/postgresql`. Порт БД не опубликован. API/Vite доступны только через loopback хоста. Конфигурация и стандартный пароль предназначены для локальной разработки.

## Данные для работы и демонстрации

```sh
make seed   # права, роли, администратор — идемпотентно
make mock   # демонстрационные данные поверх; make mock-reset откатывает только их
```

Логин и пароль администратора задаются переменными `SEED_ADMIN_EMAIL` и `SEED_ADMIN_PASSWORD`. Значения по умолчанию годятся только для локальной разработки.

## Фоновые задачи

Разбор документа моделью занимает от секунд до минуты, поэтому выполняется вне HTTP-запроса. Сервис `worker` (arq поверх Redis) берёт задачу, ведёт её статус и шаги; клиент читает прогресс через SSE `/api/v1/jobs/{id}/events`. Логи воркера — `make worker-logs`.

Провайдер выбирается в `.env.local` через `LLM_PROVIDER`: `openai`, `anthropic`, `nvidia` или
`compatible`.
Для OpenAI и Anthropic модель задаётся через `LLM_MODEL`, ключ — через `OPENAI_API_KEY` или
`ANTHROPIC_API_KEY`. Для NVIDIA API Catalog укажите `LLM_PROVIDER=nvidia`, `NVIDIA_MODEL`
(идентификатор модели из каталога) и `NVIDIA_API_KEY`; адрес `NVIDIA_BASE_URL` уже указан в
шаблонах `.env`. Пока модель и ключ NVIDIA не заданы, приложение запускается, но вызовы модели
возвращают 503.
Локальный шаблон выбирает OpenAI `gpt-6-sol` с `OPENAI_REASONING_EFFORT=medium`.

Для другого сервиса с OpenAI-совместимым HTTP API, например Qwen в Alibaba Cloud Model Studio,
задайте `LLM_PROVIDER=compatible`, `COMPATIBLE_MODEL`, `COMPATIBLE_BASE_URL` и
`COMPATIBLE_API_KEY`. Указывайте базовый URL до `/chat/completions`: клиент добавляет этот путь
сам. Для Qwen адрес зависит от региона и рабочей области ключа — выбирайте его по
[документации Alibaba Cloud](https://www.alibabacloud.com/help/en/model-studio/base-url).
Другие форматы HTTP API требуют отдельного адаптера.

## Разработка без пересборки

Исходники backend, frontend и bot примонтированы в контейнеры. Vite HMR обновляет React, Uvicorn перезапускает API, watchfiles — бота. Polling включён для Docker Desktop. Python окружение находится в `/opt/venv`, отдельно от исходников; `node_modules` — в отдельном Docker volume.

Изменение исходников не требует `./scripts/dev.sh build`. Изменение зависимостей требует обновить lock-файл и переустановить зависимости:

```sh
# После редактирования backend/pyproject.toml:
./scripts/dev.sh run --rm --no-deps api uv lock
./scripts/dev.sh up --build -d api migrate

# Добавление frontend-зависимости с фиксацией версии:
./scripts/dev.sh exec frontend npm install --save-exact PACKAGE@VERSION

# После изменения bot/pyproject.toml:
./scripts/dev.sh run --rm --no-deps bot uv lock
./scripts/dev.sh --profile bot up --build -d bot
```

Frontend при старте делает `npm ci`, синхронизируя Docker volume с lock-файлом, в том числе после смены ветки. Python собирается с `uv sync --frozen`.

## Архитектура

```text
backend/app/
  core/                       # конфигурация, сессия БД
  Domains/Notes/
    controllers/              # HTTP, тонкие endpoints
    services/                 # сценарии и бизнес-правила
    repositories/             # интерфейс и SQLAlchemy-реализация
    models/                   # ORM-модели
    DTO/                      # входные данные Pydantic
    resources/                # публичные схемы ответа
    dependencies.py           # сборка зависимостей
backend/migrations/           # Alembic, включение vector
frontend/src/
  app/                        # композиция приложения, стили
  modules/notes/               # api, types, hooks, components, pages
  shared/                     # общие UI, API-клиент, PWA
bot/app/
  handlers/                   # Telegram routers
  services/                   # API-клиент и сценарии
```

Это прагматичная модульная DDD-архитектура. Домен объединяет бизнес-возможность и может включать несколько сущностей. Для простого CRUD не дублируем ORM-модели отдельным набором сущностей. При появлении сложных инвариантов можно выделить value objects и независимые доменные модели.

Контроллер вызывает сервис, сервис работает через контракт репозитория. Репозиторий делает SQL/flush, но не commit. Транзакция охватывает весь запрос и завершается до отправки ответа. Ошибки домена переводятся в HTTP на границе приложения. API версионирован через `/api/v1`.

На фронте модуль владеет своими страницами, компонентами, состоянием и API. Другие модули используют его публичный `index.ts`. Общие примитивы находятся в `shared`; самостоятельные переиспользуемые возможности (например поиск с логикой и состоянием) оформляются как модули. Notes — демонстрация первых 100 заметок, API поддерживает `limit`/`offset`; пагинация интерфейса добавляется под продукт.

Проектные skills находятся в `.agents/skills/`: `backend-domains`, `frontend-modules`, `telegram-bot`. `AGENTS.md` направляет агента к соответствующим правилам.

## Пользователи, роли и права

Домен `backend/app/Domains/Users` содержит `User` (UUID, отдельные `first_name`,
`last_name`, `middle_name`, телефон `phone`, почта `email`, `password_hash`, дата создания),
`Role` и `Permission` (UUID, уникальный код, отображаемое имя).
У пользователя несколько ролей и личные права; роль объединяет права.
Связи many-to-many защищены составными первичными ключами от повторных назначений.
Удаление сущности удаляет её связи, сохраняя остальные сущности.

```python
from app.Domains.Users.models import Permission, Role, User

read = Permission(code="notes.read", name="Чтение заметок")
write = Permission(code="notes.write", name="Создание заметок")
reader = Role(code="reader", name="Читатель", permissions=[read])
user = User(first_name="Алексей", last_name="Иванов", roles=[reader], permissions=[read, write])

user.full_name  # "Иванов Алексей" — ФИО без пустых частей
user.get_permissions()  # {"notes.read", "notes.write"} — set[str], без повторений
user.has_permission("notes.write")  # True
```

`SqlAlchemyUserRepository.get(user_id)` заранее загружает личные права, роли
и их права: методы сущности не выполняют скрытых SQL-запросов. При самостоятельной
загрузке ORM используйте аналогичный `selectinload`; незагруженные связи вызывают
ошибку, а не возвращают неполный набор прав. `add(user)` сохраняет граф и делает
flush; commit принадлежит вызывающей транзакции. Набор прав вычисляется заново
по текущим загруженным связям при каждом вызове. Коды сравниваются точно;
запретов, наследования ролей и неявных прав администратора нет.

`UserService.create(CreateUser(...), password_hasher)` создаёт пользователя с хешем
пароля. DTO проверяет имя/фамилию, почту, телефон в международном формате `+77001234567`
(необязательный) и пароль длиной 12–128 символов. Почта приводится к нижнему регистру;
БД запрещает её дубли без учёта регистра. Исходный пароль в БД не хранится.
Миграция сохраняет старое `name` как `first_name`; остальные новые поля у старых
записей остаются NULL. Пользователь без почты и хеша пароля войти не может.

## Безопасность

`Domains/Security` владеет аутентификацией, серверными сессиями и адаптерами.
`SecurityService` работает через `TokenCodec`, `PasswordHasher`, `UserCredentials`
и `SessionRepository`. JWT реализован только адаптером `JwtTokenCodec`, подключённым
в `Security/dependencies.py`: для смены формата токенов замените этот адаптер,
сохранив контракт `encode(session_id, expires_at)` / `decode(token) -> session_id`.
Смена всей схемы аутентификации изолирована модулем и зависимостью `get_current_user`.

JWT содержит только служебные `jti` (случайный UUID сессии) и `exp` (срок действия).
ФИО, контактов, ID пользователя, ролей и прав в нём нет. Подпись проверяется с фиксированным
HS256; сессия, её срок и связь с пользователем проверяются в БД на каждом запросе.
Права также читаются из БД, поэтому изменение ролей действует без перевыпуска токена.
Пароли хешируются Argon2; хеширование и проверка вынесены из async event loop.

Для включения входа задайте `SECURITY_JWT_SECRET` в `.env.local`: случайный секрет
минимум 32 байта (например, сгенерируйте `python3 -c 'import secrets; print(secrets.token_urlsafe(48))'`).
Секрет остаётся только на сервере. `SECURITY_TOKEN_TTL_SECONDS=3600` задаёт срок сессии.
После изменения настроек выполните `./scripts/dev.sh up --build -d api migrate`.
Без настроенного секрета auth возвращает 503; небезопасного значения по умолчанию нет.

- `POST /api/v1/auth/login` — JSON `email`, `password`; ответ `access_token`, `token_type`, `expires_in`.
- `GET /api/v1/auth/me` — профиль и актуальные права, без хеша пароля.
- `POST /api/v1/auth/logout` — удаляет текущую серверную сессию, токен сразу перестаёт работать.

Передавайте токен как `Authorization: Bearer <token>`. Для защиты endpoint используйте
`Depends(get_current_user)` из `app.Domains.Security.dependencies`; необходимые права
проверяются через `user.has_permission(code)`. Notes остаётся публичным демонстрационным
доменом. Пользователи создаются через `UserService.create` в транзакции; публичной
регистрации, refresh-токенов и восстановления пароля пока нет.

Контракты библиотек: [PyJWT](https://pyjwt.readthedocs.io/en/stable/usage.html),
[Argon2 PasswordHasher](https://argon2-cffi.readthedocs.io/en/stable/api.html).

## Миграции

После добавления модели импортируйте её в `backend/migrations/env.py`, чтобы autogenerate видел metadata.

```sh
./scripts/dev.sh exec api alembic revision --autogenerate -m "add domain"
# Проверить сгенерированный файл, затем:
./scripts/dev.sh exec api alembic upgrade head
./scripts/dev.sh exec api alembic check
```

Миграции применяются отдельным одноразовым сервисом `migrate` до старта API. В тестовой базе можно проверить downgrade/upgrade. Не откатывайте миграции с данными без понимания последствий.

## Telegram-бот

Добавьте `BOT_TOKEN` от BotFather в `.env.local`, затем:

```sh
make dev-bot
```

Бот работает через long polling, команды `/start` и `/status`. Токен не нужен для обычного старта. Не запускайте несколько polling-процессов с одним токеном. Если токен уже используется webhook-ботом, переключение режима выполняется отдельно и осознанно. Бот обращается к API по внутреннему адресу `http://api:8000`, не импортирует backend-модели и не подключается напрямую к БД.

## PWA

Manifest, PNG-иконки 192/512, service worker и приглашение обновить приложение подготовлены через vite-plugin-pwa. В development SW отключён. Production build кеширует оболочку приложения, но не API. Без сети приложение открывается после первого успешного визита, а загрузка/сохранение заметок требует сеть; очереди offline-записи пока нет.

Проверка сборки и PWA локально:

```sh
./scripts/dev.sh exec frontend npm run build
./scripts/dev.sh run --rm --no-deps -p 127.0.0.1:4173:4173 frontend npm run preview
```

Откройте http://127.0.0.1:4173. Установка PWA вне localhost требует HTTPS. После тестирования service worker можно удалить в DevTools → Application, если он мешает проверке новой сборки. `vite preview` — проверка сборки, не production-сервер.

## RAG / pgvector

Образ содержит PostgreSQL 18 и pgvector 0.8.6. Первая миграция выполняет `CREATE EXTENSION IF NOT EXISTS vector`. Python-клиент `pgvector` уже установлен. Работоспособность реального vector-оператора проверяет интеграционный тест.

Когда появится сценарий RAG, создайте отдельный домен, например `Domains/Knowledge`, и сначала определите embedding-модель, размерность вектора и метрику. После этого добавьте `Vector(dimensions)` и миграцию. HNSW/IVFFlat выбирайте по размеру данных и требованиям; расширение само не выполняет chunking, генерацию эмбеддингов или вызовы LLM. Пример и ограничения — в [docs/rag.md](docs/rag.md).

## Проверки

```sh
./scripts/dev.sh exec api ruff check .
./scripts/dev.sh exec api ruff format --check .
./scripts/dev.sh exec api pytest
./scripts/dev.sh exec -e RUN_DB_TESTS=1 api pytest
./scripts/dev.sh exec api alembic check
./scripts/dev.sh exec frontend npm run build
./scripts/dev.sh run --rm --no-deps bot ruff check .
```

Обычные тесты проверяют HTTP-контракт, валидацию, создание/удаление и 404 с подменным репозиторием. `RUN_DB_TESTS=1` дополнительно проверяет сохранение через API, rollback и vector distance в настоящем PostgreSQL; тест удаляет свои записи. Не направляйте тесты на production.

## Версии

Проверены 11 сентября 2026 по PyPI/npm и официальным релизам. Выбраны стабильные релизы, не prerelease. Все Python и npm зависимости, включая транзитивные, зафиксированы в `uv.lock` и `package-lock.json`.

| Компонент | Версия |
| --- | --- |
| Python | 3.13 (образ slim-bookworm) |
| Node.js | 24.18.0 LTS |
| FastAPI / Pydantic | 0.141.1 / 2.13.5 |
| SQLAlchemy / Alembic | 2.0.52 / 1.19.2 |
| PostgreSQL / pgvector extension | 18 / 0.8.6 |
| aiogram | 3.31.0 |
| React / Vite / TypeScript | 19.3.0 / 8.3.0 / 7.0.2 |
| vite-plugin-pwa | 1.3.0 |

Python 3.13 выбран как зрелая поддерживаемая ветка. Базовые образы Python/PostgreSQL фиксируют ветку, но не digest: patch-обновления образа возможны при pull. Перед финальным деплоем зафиксируйте протестированные image digests.

Источники: [FastAPI](https://pypi.org/project/fastapi/), [SQLAlchemy](https://pypi.org/project/SQLAlchemy/), [aiogram](https://pypi.org/project/aiogram/), [React npm](https://www.npmjs.com/package/react), [Vite releases](https://vite.dev/releases), [pgvector](https://github.com/pgvector/pgvector), [Vite PWA](https://vite-pwa-org.netlify.app/guide/).

## Предметная область

Трек хакатона — логистика, поэтому в репозитории лежит справочник по внешнеторговой перевозке
и растаможке: [docs/logistic](docs/logistic). Он нужен, чтобы не проектировать сущности вслепую.

Главное оттуда — [реестр документов](docs/logistic/documents.md): у каких документов есть
утверждённая законом форма, а у каких нет. От этого зависит, что система может проверять
и предзаполнять, а что только извлекать с подтверждением человека. Рядом — разборы процедуры
для автотранспорта и железной дороги и сравнение направлений: импорт, экспорт, транзит.

Справочник описывает устройство процедур и состав документов; конкретные цифры, пороги и сроки
в нём помечены как требующие сверки с действующим законодательством. Что именно мы строим поверх
этого — в [CONTEXT.md](CONTEXT.md) §7a.

## Граница заготовки

Подготовлен локальный development stack и проверяемая сборка frontend. Для публичного развёртывания нужны отдельный production Compose/образы без reload, статический сервер SPA с `/api` reverse proxy, HTTPS, секреты, непривилегированный пользователь БД и резервные копии. Модуль Security предоставляет базовую аутентификацию; Notes сейчас общие и без авторизации. Ограничение попыток входа, регистрация, восстановление пароля, RAG pipeline и предметная логика добавляются под задачу команды.
