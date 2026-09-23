from sqlalchemy import select

from app.Domains.Integrations1C.models import IntegrationSource, RestReport


class ReportRepository:
    def __init__(self, session):
        self.session = session

    async def source_exists(self, source_id):
        return await self.session.get(IntegrationSource, source_id) is not None

    async def list(self, source_id):
        return (
            await self.session.scalars(
                select(RestReport)
                .where(RestReport.source_id == source_id)
                .order_by(RestReport.created_at, RestReport.id)
            )
        ).all()

    async def get(self, report_id):
        return await self.session.get(RestReport, report_id)

    async def save(self, report, values):
        if report is None:
            report = RestReport(**values)
            self.session.add(report)
        else:
            for key, value in values.items():
                setattr(report, key, value)
        await self.session.flush()
        await self.session.refresh(report)
        return report
