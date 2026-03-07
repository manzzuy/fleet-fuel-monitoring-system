# 0005 File Storage Receipts

- Status: Accepted
- Date: 2026-03-04

## Context

Fuel workflows will require receipt images and related file uploads. Storage decisions must preserve tenant isolation, validation discipline, and future malware scanning support.

## Decision

- Store uploaded receipts in object storage, not in the relational database.
- Prefix object keys with tenant-safe paths, for example `tenant/{tenant_id}/receipts/...`.
- Validate file type, extension, declared MIME type, and file size before accepting uploads.
- Keep an antivirus scanning hook as a required placeholder in the pipeline even if the initial implementation uses a stubbed pass/fail stage.
- Persist receipt metadata in the application database, including tenant ownership, actor, capture time, storage key, content type, size, and scan status.

## Alternatives

- Store binary files in PostgreSQL:
  - Simpler for one system, but poor fit for scale and operational cost.
- Use flat unscoped object keys:
  - Rejected because it weakens tenant safety and operational clarity.
- Skip malware scanning entirely:
  - Rejected because file uploads are a durable attack surface.

## Consequences

- Positive:
  - Better storage scalability.
  - Clear tenant-scoped file organization.
  - Cleaner path to later scanning and lifecycle rules.
- Negative:
  - Requires metadata consistency between DB and object storage.
  - Adds more operational moving parts than DB-only storage.
- Operational:
  - Upload failures, scan status, and orphan cleanup need explicit monitoring and maintenance rules.
