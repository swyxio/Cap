# Railway infrastructure

This file manages the complete production environment for `cap`, including existing services and storage. Imported variables use `preserve()`; their values stay on Railway. Do not remove resources or variables unless deletion is intended.

From the repository root:

```sh
pnpm --dir .railway install --ignore-workspace --frozen-lockfile
railway link --project 7a9607fb-97d3-4c18-a217-72c31e5c6a97 --environment production
railway config plan --detailed-exit-code
railway config apply
```

Railway evaluates `.railway/railway.ts` through the CLI. GitHub pushes alone do not apply infrastructure settings. Review the plan before applying; an unchanged environment produces no changes. The isolated SDK package does not add dependencies to the application.

Legacy `railway.toml` configuration was migrated on September 16, 2026. Railway stops reading legacy Config as Code files on December 1, 2026. See [Railway migration instructions](https://docs.railway.com/infrastructure-as-code#migrating-from-config-as-code).
