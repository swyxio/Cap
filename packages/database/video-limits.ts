import { eq } from "drizzle-orm";
import type { db } from "./index";
import { getPublicVideoLimit, isInstanceWhitelisted } from "./instance-policy";
import { users, videos } from "./schema";

type Transaction = Parameters<
	Parameters<ReturnType<typeof db>["transaction"]>[0]
>[0];

export class VideoLimitError extends Error {
	readonly code = "video_limit_reached";

	constructor(readonly limit: number) {
		super(
			`You have reached the ${limit}-video limit. Delete a recording or ask swyx to whitelist your account.`,
		);
		this.name = "VideoLimitError";
	}
}

export async function assertVideoCapacity(
	tx: Transaction,
	ownerId: typeof videos.$inferInsert.ownerId,
) {
	const limit = getPublicVideoLimit();
	if (limit > 0) {
		const [owner] = await tx
			.select({ email: users.email })
			.from(users)
			.where(eq(users.id, ownerId))
			.for("update");
		if (!owner) throw new Error("Video owner not found");

		if (!isInstanceWhitelisted(owner.email)) {
			// A locking read sees commits made while waiting for the owner lock,
			// even when the caller established an earlier repeatable-read snapshot.
			const stored = await tx
				.select({ id: videos.id })
				.from(videos)
				.where(eq(videos.ownerId, ownerId))
				.limit(limit)
				.for("update");
			if (stored.length >= limit) throw new VideoLimitError(limit);
		}
	}
}

export async function insertVideoWithLimit(
	tx: Transaction,
	data: typeof videos.$inferInsert,
) {
	await assertVideoCapacity(tx, data.ownerId);
	await tx.insert(videos).values(data);
}
