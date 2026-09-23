class OrderSource:
    def __init__(self, session):
        self.session = session

    async def recommendations(self, ids):
        from app.Domains.Replenishment.services.replenishment_service import (
            get_recommendations_for_order,
        )

        return await get_recommendations_for_order(self.session, ids)

    async def suppliers(self, ids):
        from app.Domains.Catalogs.services.catalog_service import get_suppliers

        return await get_suppliers(self.session, ids)

    async def references(self, product_ids, supplier_id, warehouse_id):
        from app.Domains.Catalogs.services.catalog_service import get_external_references

        return await get_external_references(self.session, product_ids, supplier_id, warehouse_id)
