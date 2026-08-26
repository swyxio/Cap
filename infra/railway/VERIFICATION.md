# Deployment verification — 2026-08-26

## Owner-only God view

Application commit: `68fb8de`.
Web deployment: `23fb3e60-6ae6-4017-bee6-957f6be2de7a`.
Image: `sha256:37e7c1dd4aaa17128d18409ffae7d0555ee1d3c89053acb9e5e8adc56914d30f`.
Railway independently reports `SUCCESS`.

- `/dashboard/god` is linked in the exact operator accounts' sidebar. The page,
  recording detail loader, and storage action require authenticated Gmail-owner
  or Cognition-owner access on this enabled self-hosted instance. Trusted email
  domains and organization roles alone do not qualify.
- Chrome loaded the production view under the existing authenticated Gmail
  session: 2 accounts, 0/100 public slots, 1 private video, 0 screenshots, and
  approximately 9 seconds of known duration. Both users appear, including the
  zero-recording account. All organizations are available as filters.
- The actual storage action completed: approximately 3.6 MiB across 17 objects
  in the default bucket, with zero recordings assigned to excluded storage.
  This is an on-demand object inventory, not provider billing, watch analytics,
  or a backup. Custom storage and incomplete multipart uploads are excluded.
- Chrome loaded the existing private recording in God view, exercised its native
  play control, and observed playback end at 8.698889 seconds, `readyState=4`,
  with no media error. No recording, sharing flag, or organization was changed.
- An actual search returned zero matches with the empty-state explanation, while
  instance totals remained unchanged. Reset restored the full view.
- Anonymous HTTP requests to the overview and recording detail redirected to
  login without account data, recording titles, or signed media URLs. The same
  private recording's playlist API returned 401 without authentication.
- All 178 focused tests across 10 files pass: operator authorization and DTO
  projection, filtering/pagination, zero-use users and unknown durations,
  storage coverage/failure handling, private-video policy, normal download/role
  permissions, organization setup, signup quotas, and recording quotas.
  Cross-user operator access and denial of trusted-domain/lookalike accounts
  were verified in policy tests, not a new production non-owner login.
- Scoped Biome checks pass for all 19 changed TS/TSX/JSON files. The local and
  Railway production builds pass. The focused web typecheck still has the same
  18 diagnostics in untouched/shared modules; no clean full-repository typecheck
  is claimed. Desktop Chrome was inspected; phone-width visual verification was
  not performed in this run.
- This is a read-only release: no schema migration, new credentials, production
  test records, account suspension controls, or content-deletion capability.
  The existing video read policy now allows the two operators to read private
  media; ownership checks for mutation are unchanged. No other services were
  redeployed. Source is pushed to fork `main`.

## Public quotas and domain organizations

Application commits: `8c6c686` (policy and organizations), `1ceea59` (logo storage
and quota display). Final web deployment: `21385a74-8d0d-4769-84f4-bbfffd2af055`.
Image: `sha256:f3f5128a8472de03178dbc1026a35a4d4174c6abb80b9562b86f9cde240bb3fe`.
Railway independently reports `SUCCESS`; the `/login` healthcheck passed.

- Runtime settings read back: trusted domains `ai.engineer`, `latent.space`,
  `smol.ai`; exact exceptions `shawnthe1@gmail.com`, `swyx@cognition.ai`;
  public account limit 100; public stored-recording limit 25; domain organization
  setup enabled. The limits exclude whitelisted users. Deletion frees a recording
  slot; screenshot rows also count. Existing accounts can still log in when the
  public signup pool is full.
- AIE (`swyx-aie`), Latent Space (`swyx-latent`), and Smol (`swyx-smol`) exist in
  production. Gmail is owner of all three. The existing `swyx@ai.engineer` account
  was enrolled in AIE as a member. New domain users join only their matching
  organization; other public users do not join these teams.
- `swyx@cognition.ai` is whitelisted and gets admin membership in all three on
  authenticated sign-in. That account has not yet completed a fresh successful
  login in this verification run; no unverified account was precreated.
- Authenticated Chrome loaded all three official organization logos with nonzero
  natural image dimensions. Each organization's Members page showed Gmail as
  Owner. The original active/default organization choices were restored and read
  back from MySQL. The existing production recording count remains one.
- Browser testing caught that Cap interprets organization icon URLs as S3 keys.
  The final startup seeds the bundled logo bytes into the default private bucket;
  the three seeded organization rows now hold the matching S3 keys. No custom
  logo, recording object, or other organization was changed.
- Both public login and signup return HTTP 200 with the 25/100 limits, trusted
  domains, collaboration-only/operator-access disclosure, and revocation warning.
  The public-user dashboard meter now counts all stored recordings, overrides
  self-hosted Pro's inherited Unlimited label, and shows Unavailable on read
  failure. Meter rendering was verified in tests, not a new public-account
  browser session. Whitelisted Unlimited remains visible in Chrome.
- All 162 focused tests across 15 files pass. Scoped Biome, diff checks, local
  production build, and Railway image build pass. Database/backend scoped
  typechecks pass. The web-focused check still reports 18 diagnostics in
  untouched/shared modules; the full repository typecheck is not clean and the
  upstream production build skips it.
- The actual quota helpers also passed a real MySQL concurrency harness in a
  disposable empty-schema database: parallel public signups at 99 admit exactly
  one; parallel recordings at 24 admit exactly one despite earlier transaction
  snapshots; whitelisted users bypass both limits; existing users can log in at
  capacity; deleting a recording frees a slot. No synthetic users or recordings
  were inserted into the production database. The disposable database was dropped.
- Before migration, a restricted-permission transactional SQL backup was saved
  outside the repository. Generated additive migration `0040` created only the
  signup guard table; production journal row 41 was read back. No schema push,
  dropped production columns, or recording data migration was used.
- Google Cloud's shared `swyx-io-tools` consent screen was verified as External
  and In production. Existing OAuth credentials/callbacks were not changed.
- The temporary `cap-access-20260826` Railway SSH key was revoked after final
  database verification. Existing recordings, media service, and workflow
  databases were not redeployed. The source commits are pushed to fork `main`.

No global private-recording dashboard, ban-management UI, new backup policy,
fresh desktop capture, or Cognition-account OAuth completion is claimed here.

## Collaboration landing page and operator-access disclosure

Application commit: `8a16223`.
Active web deployment: `67abf6cd-a6a0-4564-a56e-449327ce3003`.
Image: `sha256:9dcdab99b1e3045158d2ebeb4d505a2edb480425cdd0ec0685ec3bf0c7f82a06`.

- swyx reported that desktop recording worked and explicitly approved this
  instance for work with swyx. This does not independently verify a desktop
  capture-to-share-link workflow.
- Login and signup now explain the purpose, approved audience, operator access
  to all uploaded recordings (including private recordings), and official docs.
- Both production routes return HTTP 200 with the new title, prominent access
  notice, sign-in acknowledgment, and official resource links.
- The Google icon now returns HTTP 200 with `image/svg+xml`, rather than a login
  redirect. The route exception is exact, not a general static-path bypass.
- All 32 focused tests passed: rendered login/signup context, the shared usage
  notice, proxy routing, auth providers/signup allowlist, and safe redirects.
- Scoped Biome checks, the local production build, and the Railway image build
  passed. Railway reports the deployment healthy.
- The existing authenticated Chrome session still opens the dashboard. Final
  signed-out visual inspection was interrupted by concurrent browser use; live
  signed-out content was verified through HTTP, not a final browser screenshot.
- No credentials, storage configuration, database schema, account allowlist, or
  recording permissions were changed. Earlier upload/recovery tests were not
  repeated for this presentation-only release.

## Shared swyx.io Google OAuth

Active web deployment: `da877343-a3d5-4727-b334-d60264750c03`.
Runtime image unchanged from the custom-domain cutover below; only the two Google
OAuth environment variables were added.

- Reused Google Cloud project `swyx-io-tools` and its existing **swyx.io Tools Web**
  client. Exact client ID and secret matches were verified against the existing
  local swyx.io credential file without printing secret values.
- Added `https://cap.swyx.io/api/auth/callback/google`; saved-client readback
  confirmed the existing swyx.io and localhost callbacks remain unchanged.
- No OAuth client or secret was created, rotated, deleted, or disabled. Cap's
  session-signing secret remains separate from swyx.io.
- Railway reports the deployment healthy. Chrome displays **Login with Google**.
- A real authorization request uses the shared client, the Cap callback, and
  only `userinfo.email`/`userinfo.profile` scopes.
- Chrome followed the Google login flow, selected `shawnthe1@gmail.com` under
  the existing **swyx.io** app branding, and returned successfully to Cap's
  authenticated dashboard. No email code was used for this flow.
- The signup allowlist is unchanged. Email-code login remains available.

## Custom domain and Gmail cutover

Application changes: `5256482a12778c42d6c6bdeb674441ef0edf31a7`.
Active web deployment: `62434e48-3485-4416-a954-aaec84f27ae4`.
Image: `sha256:ba60c857ca9f5a8d5637653685c4b8f8a67dc6aa03ebbc814c22d4116b8a13b3`.

- Railway reports the custom domain verified, its TLS certificate valid, and the
  service healthy. `https://cap.swyx.io/login` returns 200.
- `https://swyx.io/tools/cap` and its trailing-slash variant return 301 to
  `https://cap.swyx.io/`; query parameters are preserved. `/tools/captain` remains
  404. The homepage and Reclip shortcut still behave as before.
- Chrome followed the shortcut to the Cap sign-in page on `cap.swyx.io`.
- Live auth provider callback URLs use the canonical origin. A real sign-in
  request for `shawnthe1@gmail.com` was accepted and a verification email was
  submitted through Resend. The OTP was not read or consumed. A synthetic
  unapproved address was denied without sending mail.
- 29 focused tests passed, including exact-email matching and rejection of
  other Gmail addresses, aliases, and lookalike domains.
- A clean local production build and the Railway image build passed after
  renaming the unchanged PostCSS configuration to `.cjs`. This avoids the
  Next 16.3 async config-loader regression without changing dependencies.
- S3 upload preflight accepts the new origin and rejects an unrelated origin.
  Public workflow endpoints remain blocked (404).
- No swyxdotio source files or unrelated working changes were modified.

## Initial deployment

Application code/configuration: `1bad4dba3d651c7dbf4096fa854f1a1eb00011be`.
The image was built from the corresponding working tree before this commit;
the runbook and this receipt do not change runtime code.

| Service | Successful deployment |
| --- | --- |
| cap-web | `ba9f1bc9-b911-4900-bf88-aa984f4011e8` |
| cap-media | `2f7762c5-fa73-4eb2-850d-d8df9171bcc1` |
| MySQL | `eb715cec-c3b4-42b4-adc2-08c672c7e966` |
| Postgres | `e047e88b-8659-44f9-a577-324b3c746418` |

## Passed

- Web production build; isolated workflow runtime/bootstrap imports; nginx syntax.
- Eight focused startup tests; diff whitespace checks.
- Live Chrome sign-in page; HTTP 200 `/login`.
- Real email-code login using Resend's synthetic delivery-test recipient; no
  production user's session or OTP was borrowed.
- S3 private PUT/signed GET, unsigned GET denied, HTML form POST, CORS preflight,
  multipart completion, and byte-range reads.
- Cap's actual desktop-create and multipart APIs uploaded a generated 4-second
  H264/AAC recording. Processing completed with metadata 640×360, 24fps,
  duration 4.04167 seconds.
- Cap-issued signed download returned HTTP 206 and the requested 1,024 bytes.
- Database `public=0`; anonymous RPC did not disclose a signed download URL;
  Chrome displayed “This video is private.”
- Public `/.well-known/workflow/v1/flow` returns 404.
- Actual upload workflow rows, steps, and events exist in PostgreSQL with
  `deployment_id=postgres`; no local workflow-data directory exists.
- A second generated 90-second 1080p recording was uploaded (89.9MB). While its
  processing step was running, the web service was restarted exactly once.
  PID 1's process start changed; the same run
  `wrun_01M0YHS08V89VKXGR2KHPM2JBP` completed at `08:09:27Z`, about 94 seconds
  after creation. The validation step stayed completed at attempt 1; the
  interrupted processing step completed at attempt 4, including capacity retries.
  PostgreSQL recorded one run-created/run-started/run-completed event and five
  completed steps. Signed playback still returned HTTP 206/1,024 bytes, while
  unauthenticated RPC disclosed no URL. This tests web restart recovery, not media
  process or database failure recovery.
- cgroup limits observed: web/media 2GB and 2vCPU each; MySQL/Postgres 1GB and
  1vCPU each. Media processing concurrency is one.
- Both database backup schedules were read back from Railway. Neither database
  has a public TCP proxy.
- Deployment fork `main` was pushed and independently read back at the commit
  above. Deployment uses CLI uploads, not automatic GitHub builds.
- After media processing became idle, all seven synthetic recording objects and
  the synthetic account/videos/organization were removed. Test-user and video
  counts were verified at zero. The temporary Railway SSH key was revoked and
  its local private key and test session cookie jar were removed.

## Scope and limits

The desktop application itself has not been installed or driven through a real
screen-capture session. Server tests used generated, nonpersonal media through
Cap's actual APIs. The browser checks were unauthenticated UI checks; authenticated
integration checks used HTTP. No AI generation/transcription providers are enabled.
No database restore drill or recordings object-backup policy was implemented.
The upstream production build skips the full repository typecheck.
