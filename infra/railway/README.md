# Cap on Railway

This checkout deploys Cap independently of Reclip. Upstream base:
`CapSoftware/Cap@716d2e883759ef5f92fa613a0566e4c09858af83`.

- App: https://cap.swyx.io/login
- Project: https://railway.com/project/7a9607fb-97d3-4c18-a217-72c31e5c6a97
- Workspace: swyx's Projects; production environment.
- Local source: `/Users/swyx/Work/cap`, branch `main`.
- Deployment fork: https://github.com/swyxio/Cap

## Use

The public login and signup pages explain that this instance is approved by swyx
only for collaboration with swyx. They disclose that swyx, as the server
operator, can access every uploaded recording, including recordings marked
private. This describes infrastructure access; it does not add cross-user
dashboard access or change recording permissions. Both pages link the official
Cap documentation and explain the desktop server URL and preconfigured storage.

Use **Login with Google** or email-code login. Any `ai.engineer`, `latent.space`,
or `smol.ai` account is whitelisted, as are the exact owner addresses
`shawnthe1@gmail.com` and `swyx@cognition.ai`. Other addresses can register while
the 100-account public pool has capacity; each non-whitelisted account can store
25 recordings (video and screenshot rows). Deleting a recording frees a slot.
Whitelisted accounts do not count toward either public limit. Non-whitelisted
access is explicitly described as revocable by swyx at any time. Email-code login also remains available through the existing
verified `auth@smol.ai` Resend sender. There is no shared password. New recordings
are private by default; sharing is an explicit choice.

In Cap Desktop, open Settings → General → Self-host → Cap Server URL, set
`https://cap.swyx.io`, then sign in to this instance.
Desktop capture itself is distinct from the server-side integration tests.

## Organizations and public access

| Organization | Auto-join email domain | Stable ID |
| --- | --- | --- |
| AIE | `ai.engineer` | `swyx-aie` |
| Latent Space | `latent.space` | `swyx-latent` |
| Smol | `smol.ai` | `swyx-smol` |

The Gmail account owns all three; `swyx@cognition.ai` gets admin membership in all
three on sign-in. Domain members join only their matching organization. Other
public accounts receive their own organization, not membership in these teams.
Existing organization choices, videos, and playback restrictions are preserved.
Official logos are bundled locally and seeded into the default private S3 bucket
before organization setup at startup. Organization icons store S3 object keys,
so Cap resolves them through its normal signed-image URLs. Provenance is in
`apps/web/public/instance-logos/SOURCES.md`.

Startup applies the additive `0040` signup-guard migration before idempotently
creating the organizations and joining existing matching users. New authenticated
signups join during the account-creation transaction. The shared signup guard
serializes account admission; per-owner row locks serialize recording quotas.
API, desktop, imports, duplication, and ownership-transfer paths enforce capacity.
Duplicate operations reserve a slot before copying media; failed attempts may
leave a recording row that the user can delete to free the slot.

To whitelist an additional person, append their exact email to
`CAP_ALLOWED_SIGNUP_DOMAINS` and deploy. This removes public quotas but does not
add that person to a team organization. The warning is not a new ban-management
UI; no cross-user dashboard or recording access override was added.

## Domain routing

`cap.swyx.io` is the canonical app origin. Cloudflare DNS has a DNS-only CNAME
`cap` → `g96f7lej.up.railway.app` and the Railway ownership TXT record at
`_railway-verify.cap`. Railway custom domain
`785ca17a-5d86-4113-b1a2-d3905611fb6e` targets port 8080 and owns the TLS certificate.

Cloudflare Single Redirect rule `01d40397c69542bb9dcd60129ab59fd2` ("Cap tool
shortcut") sends only `swyx.io/tools/cap` and `swyx.io/tools/cap/` to
`https://cap.swyx.io/` with status 301 and query-string preservation. It does not
proxy Cap under a subdirectory. This rule is configured in the zone dashboard;
no swyxdotio Worker release or unrelated website changes are needed.

Both build-time and runtime `WEB_URL`, `NEXTAUTH_URL`, and
`NEXT_PUBLIC_WEB_URL` use `https://cap.swyx.io`. The original Railway hostname is
still available, but new desktop configurations should use the canonical origin.

## Google OAuth

Cap reuses the existing **swyx.io Tools Web** OAuth client in Google Cloud project
`swyx-io-tools`, rather than creating another app. Its existing credentials are
configured as Railway `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; neither
secret was rotated. Cap's `NEXTAUTH_SECRET` remains independent of swyx.io.

The client keeps its existing callback URLs and adds Cap's callback:

```text
https://swyx.io/tools/auth/google/callback
http://localhost:4188/tools/auth/google/callback
https://cap.swyx.io/api/auth/callback/google
```

The authorization request uses only basic Google profile/email scopes, not Gmail
or Drive access. The same whitelist and capped-public-signup policy applies to Google and email login.
The OAuth consent screen uses the shared swyx.io app branding. Future rotation
of this shared client secret must update both services together.

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
CAP_ALLOWED_SIGNUP_DOMAINS=ai.engineer,latent.space,smol.ai,shawnthe1@gmail.com,swyx@cognition.ai
CAP_PUBLIC_SIGNUP_LIMIT=100
CAP_PUBLIC_VIDEO_LIMIT=25
CAP_DOMAIN_ORGANIZATIONS_ENABLED=true
RESEND_FROM_DOMAIN=smol.ai
```

Use the explicit `cap-web` reference in the callback URL: an unqualified
`${{RAILWAY_PRIVATE_DOMAIN}}` did not resolve in our first deployed configuration.
No AI transcription or generation keys are enabled.

The bucket CORS allowlist contains `https://cap.swyx.io` and the original Railway
app origin, methods GET/HEAD/PUT/POST,
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
The unchanged CommonJS PostCSS config uses a `.cjs` extension to avoid the
Next 16.3 Turbopack async config-loader regression reported in
https://github.com/vercel/next.js/issues/96619.

`railway restart --service cap-web --yes` restarts without rebuilding.
`railway redeploy` can rebuild this uploaded-source deployment.

`origin` points to the deployment fork; `upstream` points to CapSoftware/Cap.
No deployment secrets should be added to Git. GitHub pushes do not automatically
deploy: releases currently use the explicit CLI upload commands above.
