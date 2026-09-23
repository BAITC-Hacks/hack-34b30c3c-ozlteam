# Подключение RAG

Расширение `vector` уже включено миграцией. Векторные таблицы пока не создаются: размерность зависит от выбранной embedding-модели и должна быть стабильным контрактом данных.

Пример для будущей модели SQLAlchemy (1536 — только пример, замените размерностью реальной модели):

```python
from pgvector.sqlalchemy import Vector
from sqlalchemy.orm import Mapped, mapped_column

embedding: Mapped[list[float]] = mapped_column(Vector(1536))
```

Для небольшой базы начните с точного поиска. Пример запроса в репозитории:

```python
statement = (
    select(Chunk)
    .order_by(Chunk.embedding.cosine_distance(query_embedding))
    .limit(limit)
)
```

Для HNSW создайте Alembic-миграцию с PostgreSQL `USING hnsw` и `vector_cosine_ops`, если используете cosine. В миграции явно импортируйте `pgvector.sqlalchemy` для сгенерированного типа. Проверяйте итоговый SQL и поддержку размерности выбранным индексом.

Храните источник документа, положение chunk, версию embedding-модели и права доступа вместе с данными. Фильтрация по доступу обязательна для приватного корпуса и должна входить в retrieval-запрос. Изменение модели обычно требует переиндексации и пересчёта всего корпуса. Embedding/LLM API keys остаются на сервере.

Отдельный сервис домена организует ingestion, chunking, embeddings и retrieval; HTTP/Telegram остаются тонкими адаптерами. Длительные операции выносите в фоновые задания, когда появится реальная необходимость.
