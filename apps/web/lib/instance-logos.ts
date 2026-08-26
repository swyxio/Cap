import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { INSTANCE_ORGANIZATIONS } from "@cap/database/instance-organizations";
import { serverEnv } from "@cap/env";
import { S3Buckets } from "@cap/web-backend/src/S3Buckets/index";
import { Effect } from "effect";

export async function setupInstanceLogos() {
	if (!serverEnv().CAP_DOMAIN_ORGANIZATIONS_ENABLED) return;

	await Effect.runPromise(
		Effect.gen(function* () {
			const buckets = yield* S3Buckets;
			const [s3] = yield* buckets.getBucketAccess();
			for (const { logoPath } of INSTANCE_ORGANIZATIONS) {
				const key = logoPath.slice(1);
				const body = yield* Effect.tryPromise(() =>
					readFile(join(process.cwd(), "public", key)),
				);
				yield* s3.putObject(key, body, {
					contentType: key.endsWith(".svg") ? "image/svg+xml" : "image/png",
					contentLength: body.length,
				});
			}
		}).pipe(Effect.provide(S3Buckets.Default)),
	);
}
