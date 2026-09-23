from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

from app.Domains.Replenishment.adapters.xlsx import (
    InvalidWorkbook,
    create_workbook,
    parse_workbook,
)
from app.Domains.Replenishment.DTO.calculation import CalculationInput
from app.Domains.Replenishment.resources.calculation import CalculationResult
from app.Domains.Replenishment.services.calculation import calculate
from app.Domains.Replenishment.services.demo import demo_input

router = APIRouter(prefix="/replenishment", tags=["Replenishment"])
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get(
    "/demo",
    response_model=CalculationInput,
    summary="Получить демонстрационные данные для расчёта",
    description=(
        "Синтетические продажи, остатки и поставщики; "
        "клиентов можно видеть только по обезличенным ID."
    ),
)
async def get_demo():
    return demo_input()


@router.post(
    "/calculate",
    response_model=CalculationResult,
    summary="Рассчитать рекомендации на закупку",
    description=(
        "Возвращает только позиции с положительной потребностью. Расчёт ведётся по каждому складу "
        "и показывает историю, исключённые разовые продажи, потерянный спрос "
        "и прогнозные множители. "
        "Заказ поставщику не отправляется."
    ),
    responses={422: {"description": "Ошибка структуры входных данных или ссылок между листами"}},
)
async def calculate_replenishment(data: CalculationInput):
    return calculate(data)


@router.post(
    "/import",
    response_model=CalculationInput,
    summary="Прочитать XLSX для расчёта",
    description=(
        "Обязательные листы: products, suppliers, sales, stock, inbound, "
        "stockouts, category_growth. "
        "Необязательный config задаёт as_of и review_days. При его отсутствии дата расчёта "
        "берётся из последней продажи, период пересмотра равен 14 дням."
    ),
    responses={
        415: {"description": "Нужен файл .xlsx"},
        422: {"description": "Ошибки листов или значений"},
    },
)
async def import_replenishment(file: Annotated[UploadFile, File(description="Книга Excel .xlsx")]):
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(status_code=415, detail="Нужен файл .xlsx")
    try:
        return parse_workbook(await file.read())
    except InvalidWorkbook as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get(
    "/template",
    response_class=Response,
    summary="Скачать заполненный шаблон XLSX",
    description="Синтетический пример с семью предметными листами и листом config.",
    responses={200: {"content": {XLSX_MEDIA_TYPE: {}}, "description": "Файл Excel для импорта"}},
)
async def get_template():
    return Response(
        content=create_workbook(demo_input()),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="replenishment-demo.xlsx"'},
    )
