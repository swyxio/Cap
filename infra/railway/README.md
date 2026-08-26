# Cap on Railway

This checkout deploys Cap independently of Reclip. Upstream base:
`CapSoftware/Cap@716d2e883759ef5f92fa613a0566e4c09858af83`.

- App: https://cap-web-production-d6ca.up.railway.app/login
- Project: https://railway.com/project/7a9607fb-97d3-4c18-a217-72c31e5c6a97
- Workspace: swyx's Projects; production environment.
- Local source: `/Users/swyx/Work/cap`, branch `main`.
- Deployment fork: https://github.com/swyxio/Cap

## Use

Sign in with an `ai.engineer` or `smol.ai` email. Codes come from
`auth@smol.ai` through the existing verified Resend sender. There is no shared
password. New recordings are private by default; sharing is an explicit choice.

In Cap Desktop, open Settings → General → Self-host → Cap Server URL, set
`https://cap-web-production-d6ca.up.railway.app`, then sign in to this instance.
Desktop capture itself is distinct from the server-side integration tests.

## Services

| Resource | Purpose | Exposure |
| --- | --- | --- |
| cap-web | Next.js, API, workflow worker, nginx | HTTPS on port 8080 |
| cap-media | Video processing and thumbnails, one concurrent process | Private port 3456 |
| MySQL | Cap users, organizations, video metadata | Private only; persistent volume |
| Postgres | Workflow SDK run/event/step state and Graphile queue | Private only; persistent volume |
| recordings | Native Railway S3-compatible bucket, US West | Private objects; presigned client uploads/playback |

The web process listens on loopback port 3000. nginx denies public access to
`/.well-known/workflow/`; the Postgres worker invokes those handlers locally.
Workflow persistence is not the media server's transient in-process job state.

Both databases have daily (6-day retention) and weekly (27-day retention) Railway
volume backup schedules. These do **not** back up the recordings bucket. Native
bucket versioning and lifecycle policies are unavailable; object deletion is not
covered by those database backups.

## Configuration

Secrets live in Railway variables, not this repository. The web service uses
private database references and bucket credential references. Keep
`DATABASE_ENCRYPTION_KEY` and `NEXTAUTH_SECRET` stable across releases.

Key settings:

```text
DATABASE_URL=${{MySQL.MYSQL_URL}}
WORKFLOW_TARGET_WORLD=@workflow/world-postgres
WORKFLOW_POSTGRES_URL=${{Postgres.DATABASE_URL}}
WORKFLOW_LOCAL_BASE_URL=http://127.0.0.1:3000
WORKFLOW_POSTGRES_WORKER_CONCURRENCY=2
WORKFLOW_POSTGRES_MAX_POOL_SIZE=5
MEDIA_SERVER_URL=http://${{cap-media.RAILWAY_PRIVATE_DOMAIN}}:3456
MEDIA_SERVER_WEBHOOK_URL=http://${{cap-web.RAILWAY_PRIVATE_DOMAIN}}:8080
MEDIA_SERVER_WEBHOOK_SECRET=${{cap-media.MEDIA_SERVER_WEBHOOK_SECRET}}
CAP_AWS_BUCKET=${{recordings.BUCKET}}
CAP_AWS_REGION=${{recordings.REGION}}
CAP_AWS_ACCESS_KEY=${{recordings.ACCESS_KEY_ID}}
CAP_AWS_SECRET_KEY=${{recordings.SECRET_ACCESS_KEY}}
S3_PUBLIC_ENDPOINT=${{recordings.ENDPOINT}}
S3_INTERNAL_ENDPOINT=${{recordings.ENDPOINT}}
S3_PATH_STYLE=false
CAP_VIDEOS_DEFAULT_PUBLIC=false
CAP_ALLOWED_SIGNUP_DOMAINS=ai.engineer,smol.ai
RESEND_FROM_DOMAIN=smol.ai
```

Use the explicit `cap-web` reference in the callback URL: an unqualified
`${{RAILWAY_PRIVATE_DOMAIN}}` did not resolve in our first deployed configuration.
No AI transcription or generation keys are enabled.

The bucket CORS allowlist contains only the app origin, methods GET/HEAD/PUT/POST,
all request headers, and exposed ETag/Content-Length/Content-Range/Accept-Ranges.
When changing domains, update CORS, runtime URL variables, and the public build
URL in `Dockerfile.web`, then rebuild.

## Deploy

From this directory's repository root:

```sh
railway link --project 7a9607fb-97d3-4c18-a217-72c31e5c6a97 --environment production
railway up --service cap-web --detach --json
railway up apps/media-server --path-as-root --service cap-media --detach --json
railway service list --json
```

The web image bootstraps the workflow schema, runs Cap's MySQL migrations, then
starts the worker and app. Failed migrations prevent startup. Bucket creation or
public-policy modification is deliberately not part of startup.

The pinned Postgres World runtime has a separate lockfile under `workflow/`:
Next's standalone tracing otherwise omitted transitive workflow dependencies.
Image construction verifies both the runtime and bootstrap imports plus nginx
configuration before publishing. The existing upstream build skips typechecking;
a successful image build is not proof of a clean repository-wide typecheck.

`railway restart --service cap-web --yes` restarts without rebuilding.
`railway redeploy` can rebuild this uploaded-source deployment.

`origin` points to the deployment fork; `upstream` points to CapSoftware/Cap.
No deployment secrets should be added to Git. GitHub pushes do not automatically
deploy: releases currently use the explicit CLI upload commands above.
