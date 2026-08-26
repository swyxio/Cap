import "server-only";

import { db } from "@cap/database";
import { organizations, users, videos } from "@cap/database/schema";
import { provideOptionalAuth, Videos } from "@cap/web-backend";
import { Video } from "@cap/web-domain";
import { eq } from "drizzle-orm";
import { Effect, Option } from "effect";
import { notFound } from "next/navigation";
import { requireInstanceOperator } from "./instance-admin";
import { runPromise } from "./server";

export async function getInstanceRecording(id: string) {
	await requireInstanceOperator();
	if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) notFound();
	const [recording] = await db()
		.select({
			id: videos.id,
			name: videos.name,
			ownerEmail: users.email,
			orgName: organizations.name,
			public: videos.public,
			isScreenshot: videos.isScreenshot,
			duration: videos.duration,
			width: videos.width,
			height: videos.height,
			createdAt: videos.createdAt,
			source: videos.source,
			jobStatus: videos.jobStatus,
			skipProcessing: videos.skipProcessing,
		})
		.from(videos)
		.leftJoin(users, eq(users.id, videos.ownerId))
		.leftJoin(organizations, eq(organizations.id, videos.orgId))
		.where(eq(videos.id, Video.VideoId.make(id)))
		.limit(1);
	if (!recording) notFound();
	const download = await runPromise(
		Effect.gen(function* () {
			const service = yield* Videos;
			return yield* service.getDownloadInfo(recording.id);
		}).pipe(provideOptionalAuth),
	)
		.then(Option.getOrNull)
		.catch(() => null);
	return { ...recording, download };
}
