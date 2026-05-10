# ADR 0001: Prefix Supabase objects with `rt_`

## Status

Accepted

## Context

The target Supabase project can contain unrelated existing tables. The
translation meeting app needs a clear operational boundary so administrators
can filter, back up, audit, or remove app-owned objects without confusing them
with other company data.

## Decision

Use `rt_` as the prefix for app-owned Supabase tables, enums, indexes, and
constraints. Application code should reference the prefixed table names
directly, for example `rt_meetings`, `rt_guest_sessions`, and
`rt_translation_sessions`.

Column names remain domain-oriented and unprefixed unless they identify an
external object. For example, `rt_meetings.notes_status` stays `notes_status`.

## Consequences

- Database objects are easier to scan and manage in a shared Supabase project.
- Future migrations must keep the `rt_` prefix for every app-owned object.
- If the app later moves to a dedicated schema, the prefix can still remain as a
  compatibility boundary during migration.
