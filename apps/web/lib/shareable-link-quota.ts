import "server-only";

import { db } from "@cap/database";
import {
	getPublicVideoLimit,
	isInstanceWhitelisted,
} from "@cap/database/instance-policy";
import { videos } from "@cap/database/schema";
import { userIsPro } from "@cap/utils";
import { type User, Video } from "@cap/web-domain";
import { and, count, eq, gte, lt, or } from "drizzle-orm";
import type { ShareableLinkUsage } from "@/app/(org)/dashboard/DashboardContext";

const monthStartUtc = (reference: Date) =>
	new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));

const quotaWindowStart = (reference: Date) => {
	const start = monthStartUtc(reference);
	return start > Video.SHAREABLE_LINK_LIMIT_ENFORCED_FROM
		? start
		: Video.SHAREABLE_LINK_LIMIT_ENFORCED_FROM;
};

/**
 * A video is over quota when 25 or more of the owner's videos were created
 * earlier in the same calendar month (UTC). The flag is derived from creation
 * order, so it sticks to the video across month boundaries, disappears the
 * moment the owner upgrades (callers skip the check for Pro owners), and
 * frees up if earlier videos from that month are deleted.
 */
export async function isVideoOverShareableLinkLimit(video: {
	id: Video.VideoId;
	ownerId: User.UserId;
	createdAt: Date;
	isScreenshot: boolean;
}): Promise<boolean> {
	if (video.isScreenshot) return false;
	if (video.createdAt < Video.SHAREABLE_LINK_LIMIT_ENFORCED_FROM) return false;

	const [row] = await db()
		.select({ earlier: count() })
		.from(videos)
		.where(
			and(
				eq(videos.ownerId, video.ownerId),
				eq(videos.isScreenshot, false),
				gte(videos.createdAt, quotaWindowStart(video.createdAt)),
				or(
					lt(videos.createdAt, video.createdAt),
					and(eq(videos.createdAt, video.createdAt), lt(videos.id, video.id)),
				),
			),
		);

	return (row?.earlier ?? 0) >= Video.FREE_PLAN_SHAREABLE_LINKS_PER_MONTH;
}

export async function getShareableLinkUsage(userId: User.UserId): Promise<{
	used: number;
	limit: number;
}> {
	const [row] = await db()
		.select({ used: count() })
		.from(videos)
		.where(
			and(
				eq(videos.ownerId, userId),
				eq(videos.isScreenshot, false),
				gte(videos.createdAt, quotaWindowStart(new Date())),
			),
		);

	return {
		used: row?.used ?? 0,
		limit: Video.FREE_PLAN_SHAREABLE_LINKS_PER_MONTH,
	};
}

export async function getDashboardShareableLinkUsage(
	user: { id: User.UserId; email: string } & NonNullable<
		Parameters<typeof userIsPro>[0]
	>,
): Promise<ShareableLinkUsage | null> {
	const limit = getPublicVideoLimit();
	if (limit > 0 && !isInstanceWhitelisted(user.email)) {
		try {
			const [row] = await db()
				.select({ used: count() })
				.from(videos)
				.where(eq(videos.ownerId, user.id));
			return { kind: "stored", used: row?.used ?? null, limit };
		} catch (error) {
			console.error("Failed to load stored recording usage", error);
			return { kind: "stored", used: null, limit };
		}
	}

	if (userIsPro(user)) return null;
	return getShareableLinkUsage(user.id).catch((error) => {
		console.error("Failed to load shareable link usage", error);
		return null;
	});
}
