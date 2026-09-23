"""Stateless compatibility API for the demo frontend; never writes purchasing records."""

from asyncio import to_thread
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response

from app.core.access import require_permission
from app.core.errors import ERROR_RESPONSES
from app.Domains.Replenishment.adapters.xlsx import (
    InvalidWorkbook,
    create_workbook,
    parse_workbook,
)
from app.Domains.Replenishment.DTO.calculation import CalculationInput
from app.Domains.Replenishment.resources.calculation import CalculationResult
from app.Domains.Replenishment.services.calculation import calculate
from app.Domains.Replenishment.services.demo import demo_input

router = APIRouter(
    prefix="/replenishment", tags=["Пополнение: предпросмотр"], responses=ERROR_RESPONSES
)
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
MAX_WORKBOOK_BYTES = 25 * 1024 * 1024


@router.get(
    "/demo",
    response_model=CalculationInput,
    summary="Предпросмотр: демонстрационные данные",
    dependencies=[Depends(require_permission("replenishment.read"))],
    description=(
        "Право replenishment.read. Синтетические продажи, остатки и поставщики; "
        "клиентов можно видеть только по обезличенным ID. Данные не записываются в БД."
    ),
)
async def get_demo():
    return demo_input()


@router.post(
    "/calculate",
    response_model=CalculationResult,
    summary="Предпросмотр: рассчитать рекомендации без сохранения",
    dependencies=[Depends(require_permission("replenishment.run"))],
    description=(
        "Право replenishment.run. Совместимый предварительный расчёт по переданному телу; "
        "не создаёт CalculationRun, UUID-рекомендации или черновики заказов. "
        "Для сохранённого расчёта по данным 1С используйте POST /replenishment/runs. "
        "Возвращает только позиции с положительной потребностью. Расчёт ведётся по каждому складу "
        "и показывает историю, исключённые разовые продажи, потерянный спрос "
        "и прогнозные множители. "
        "Заказ поставщику не отправляется."
    ),
    responses={422: {"description": "Ошибка структуры входных данных или ссылок между листами"}},
)
async def calculate_replenishment(data: CalculationInput):
    return await to_thread(calculate, data)


@router.post(
    "/import",
    response_model=CalculationInput,
    summary="Предпросмотр: прочитать XLSX без применения к источнику",
    dependencies=[Depends(require_permission("replenishment.run"))],
    description=(
        "Право replenishment.run. Возвращает проверенное содержимое книги без записи в БД; "
        "для загрузки в учётные данные используйте /imports. Лимит файла 25 МиБ. "
        "Обязательные листы: products, suppliers, sales, stock, inbound, "
        "stockouts, category_growth. "
        "Также принимаются русские названия листов и колонок из скачанного шаблона: "
        "Товары, Поставщики, Продажи, Остатки, Товары в пути, Периоды отсутствия, "
        "Прирост по категориям. Справочная колонка с названием поставщика не меняет его код. "
        "Необязательный config задаёт as_of и review_days. При его отсутствии дата расчёта "
        "берётся из последней продажи, период пересмотра равен 14 дням. "
        "Русский вариант config — лист Настройки с параметрами "
        "Дата расчёта и Период пересмотра, дней."
    ),
    responses={
        413: {"description": "Файл превышает 25 МиБ"},
        415: {"description": "Нужен файл .xlsx"},
        422: {"description": "Ошибки листов или значений"},
    },
)
async def import_replenishment(file: Annotated[UploadFile, File(description="Книга Excel .xlsx")]):
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(status_code=415, detail="Нужен файл .xlsx")
    content = await file.read(MAX_WORKBOOK_BYTES + 1)
    if len(content) > MAX_WORKBOOK_BYTES:
        raise HTTPException(status_code=413, detail="Файл превышает 25 МиБ")
    try:
        return await to_thread(parse_workbook, content)
    except InvalidWorkbook as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get(
    "/template",
    response_class=Response,
    summary="Предпросмотр: скачать заполненный шаблон XLSX",
    dependencies=[Depends(require_permission("replenishment.read"))],
    description=(
        "Право replenishment.read. Синтетический пример: семь листов данных, Настройки "
        "и Как заполнить. Русские заголовки, названия поставщиков, фильтры и закреплённая шапка. "
        "В листе Товары скрытая колонка D хранит код поставщика для обратной загрузки; "
        "видимое название справочное. Совместим с POST /replenishment/import. Это не заказ."
    ),
    responses={
        200: {
            "content": {XLSX_MEDIA_TYPE: {}},
            "description": "Файл Excel для предпросмотра",
            "headers": {
                "Content-Disposition": {
                    "schema": {"type": "string"},
                    "description": "attachment; filename=replenishment-demo.xlsx",
                }
            },
        }
    },
)
async def get_template():
    return Response(
        content=await to_thread(create_workbook, demo_input()),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="replenishment-demo.xlsx"'},
    )
