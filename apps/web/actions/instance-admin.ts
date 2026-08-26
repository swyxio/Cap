"use server";

import { db } from "@cap/database";
import { users, videos } from "@cap/database/schema";
import { S3Buckets } from "@cap/web-backend";
import { count, isNotNull, or } from "drizzle-orm";
import { Effect } from "effect";
import { requireInstanceOperator } from "@/lib/instance-admin";
import { measureInstanceStorage } from "@/lib/instance-storage";
import { runPromise } from "@/lib/server";

export async function getInstanceStorageUsage() {
	await requireInstanceOperator();
	try {
		const [owners, [custom]] = await Promise.all([
			db().select({ id: users.id, email: users.email }).from(users),
			db()
				.select({ count: count() })
				.from(videos)
				.where(
					or(isNotNull(videos.bucket), isNotNull(videos.storageIntegrationId)),
				),
		]);
		if (!custom) throw new Error("Storage coverage unavailable");
		const measurement = await runPromise(
			Effect.gen(function* () {
				const buckets = yield* S3Buckets;
				const [bucket] = yield* buckets.getBucketAccess();
				return yield* Effect.tryPromise(() =>
					measureInstanceStorage(
						(token) =>
							runPromise(
								bucket.listObjects({ maxKeys: 1000, continuationToken: token }),
							),
						owners,
					),
				);
			}).pipe(Effect.timeout("45 seconds")),
		);
		return {
			status: "available" as const,
			...measurement,
			excludedRecordings: custom.count,
		};
	} catch {
		return {
			status: "unavailable" as const,
			message:
				"Storage measurement failed. No usage total is available; try again.",
		};
	}
}
