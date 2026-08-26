# Deployment verification — 2026-08-26

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
