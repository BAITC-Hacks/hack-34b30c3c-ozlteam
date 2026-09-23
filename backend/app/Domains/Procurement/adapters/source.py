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

    async def manual_catalog(self, product_ids, supplier_id, warehouse_id):
        from app.Domains.Catalogs.repositories.catalog_repository import CatalogRepository
        from app.Domains.Catalogs.resources.catalog import RESOURCES

        repository = CatalogRepository(self.session)
        products, supplier, warehouse = await repository.external_references(
            product_ids, supplier_id, warehouse_id
        )

        def resource(kind, record):
            return RESOURCES[kind].model_validate(record).model_dump() if record else None

        return {
            "supplier": resource("suppliers", supplier),
            "warehouse": resource("warehouses", warehouse),
            "products": [resource("products", product) for product in products],
        }
