---
name: swagger-openapi
description: Keep this project's FastAPI Swagger/OpenAPI contract accurate when changing API routes, DTOs, responses, authentication, errors, files, streams, or frontend API integration.
---

# Swagger/OpenAPI as the API contract

`backend/app/main.py` exposes Swagger UI at `/docs` and the generated specification at `/openapi.json`. Route declarations in `backend/app/Domains/*/controllers`, input DTOs and output resources are the source of truth. Keep the generated contract useful enough that a frontend agent or a person can integrate without reading service implementation.

## When changing an API

1. Inspect the affected route, DTO/resource, domain errors and frontend caller. Identify the actual URL (including `/api/v1`), method, authentication, request fields and constraints, response shape, status codes, media type, headers and relevant failure cases.
2. Update FastAPI's OpenAPI metadata in the same change as the behavior: a clear operation summary and description; typed path/query/body/file parameters; explicit request and response schemas; accurate success status and `responses` for meaningful errors. Put field descriptions, constraints and examples in Pydantic schemas where they help a client. Use the project's user-facing language while preserving exact API identifiers.
3. Document non-JSON behavior explicitly. For downloads/previews specify media type and important headers; for SSE specify event names, data shape and when the stream ends. Describe authorization with the real FastAPI security dependency and actual 401/403 behavior. Never claim a response or permission the implementation does not provide.
4. Check the generated `/openapi.json` for the changed operation and open `/docs` when the rendered presentation matters. Exercise at least the changed success path and meaningful error path with a focused test or an existing test suite. Ensure documented examples are valid, do not contain credentials or personal data, and match the runtime payload.

When consuming an API from the frontend, inspect the generated contract before assuming fields, optionality, status codes or auth behavior. If the contract is incomplete or disagrees with runtime behavior, correct the backend documentation as part of the API change or report the mismatch explicitly; do not invent a frontend-only contract.

Keep this work scoped to affected endpoints and shared schemas. Do not rewrite unrelated routes or maintain a second hand-written copy of the OpenAPI specification.
