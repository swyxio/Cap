import "server-only";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { isInstanceOperatorEmail } from "@cap/database/instance-operator";
import {
	getPublicSignupLimit,
	getPublicVideoLimit,
	isInstanceWhitelisted,
} from "@cap/database/instance-policy";
import { organizations, users, videos } from "@cap/database/schema";
import { buildEnv, serverEnv } from "@cap/env";
import { Organisation, User } from "@cap/web-domain";
import { and, count, desc, eq, or, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import type {
	InstanceOverview,
	InstanceOverviewFilters,
	InstanceUsage,
	InstanceUserRow,
} from "./instance-admin-types";

const PAGE_SIZE = 50;

export async function requireInstanceOperator() {
	if (
		buildEnv.NEXT_PUBLIC_IS_CAP === "true" ||
		!serverEnv().CAP_DOMAIN_ORGANIZATIONS_ENABLED
	) {
		notFound();
	}
	const user = await getCurrentUser();
	if (!user || !isInstanceOperatorEmail(user.email)) notFound();
	return user;
}

function finiteNonnegative(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	if (typeof value !== "number" && typeof value !== "string") return null;
	if (typeof value === "string" && !value.trim()) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function requiredCount(value: unknown): number {
	const parsed = finiteNonnegative(value);
	if (parsed === null || !Number.isSafeInteger(parsed)) {
		throw new Error("Instance usage count is unavailable");
	}
	return parsed;
}

function isoDate(value: Date): string {
	return value.toISOString();
}

function usageFields() {
	return {
		recordings: sql<
			number | string
		>`COUNT(CASE WHEN ${videos.isScreenshot} = false THEN 1 END)`,
		screenshots: sql<
			number | string
		>`COUNT(CASE WHEN ${videos.isScreenshot} = true THEN 1 END)`,
		durationSeconds: sql<
			number | string | null
		>`SUM(CASE WHEN ${videos.isScreenshot} = false AND ${videos.duration} >= 0 THEN ${videos.duration} END)`,
		knownDurationCount: sql<
			number | string
		>`COUNT(CASE WHEN ${videos.isScreenshot} = false AND ${videos.duration} >= 0 THEN 1 END)`,
	};
}

function toUsage(row: {
	recordings: number | string;
	screenshots: number | string;
	durationSeconds: number | string | null;
	knownDurationCount: number | string;
}): InstanceUsage {
	const knownDurationCount = requiredCount(row.knownDurationCount);
	return {
		recordings: requiredCount(row.recordings),
		screenshots: requiredCount(row.screenshots),
		durationSeconds:
			knownDurationCount === 0 ? null : finiteNonnegative(row.durationSeconds),
		knownDurationCount,
	};
}

export async function getInstanceOverview(
	input: {
		q?: string;
		userId?: string;
		orgId?: string;
		kind?: string;
		page?: string;
	} = {},
): Promise<InstanceOverview> {
	await requireInstanceOperator();
	const filters: InstanceOverviewFilters = {
		q: input.q?.trim().slice(0, 200) ?? "",
		userId: input.userId?.trim() ?? "",
		orgId: input.orgId?.trim() ?? "",
		kind:
			input.kind === "recordings" || input.kind === "screenshots"
				? input.kind
				: "",
	};
	const pattern = `%${filters.q.replace(/[!%_]/g, "!$&")}%`;
	const where = and(
		filters.userId
			? eq(videos.ownerId, User.UserId.make(filters.userId))
			: undefined,
		filters.orgId
			? eq(videos.orgId, Organisation.OrganisationId.make(filters.orgId))
			: undefined,
		filters.kind
			? eq(videos.isScreenshot, filters.kind === "screenshots")
			: undefined,
		filters.q
			? or(
					sql`${videos.name} LIKE ${pattern} ESCAPE '!'`,
					sql`${users.name} LIKE ${pattern} ESCAPE '!'`,
					sql`${users.email} LIKE ${pattern} ESCAPE '!'`,
				)
			: undefined,
	);
	const database = db();
	const [userUsageRows, orgs, [summaryRow], [filteredRow]] = await Promise.all([
		database
			.select({
				id: users.id,
				name: users.name,
				email: users.email,
				createdAt: users.created_at,
				...usageFields(),
				lastRecordingAt:
					sql<Date | null>`MAX(CASE WHEN ${videos.isScreenshot} = false THEN ${videos.createdAt} END)`.mapWith(
						videos.createdAt,
					),
			})
			.from(users)
			.leftJoin(videos, eq(videos.ownerId, users.id))
			.groupBy(users.id, users.name, users.email, users.created_at)
			.orderBy(desc(users.created_at), users.id),
		database
			.select({ id: organizations.id, name: organizations.name })
			.from(organizations)
			.orderBy(organizations.name, organizations.id),
		database.select(usageFields()).from(videos),
		database
			.select({ total: count() })
			.from(videos)
			.leftJoin(users, eq(videos.ownerId, users.id))
			.where(where),
	]);
	if (!summaryRow || !filteredRow) {
		throw new Error("Instance usage summary is unavailable");
	}
	const totalFiltered = requiredCount(filteredRow.total);
	const requestedPage = /^\d+$/.test(input.page ?? "") ? Number(input.page) : 1;
	const page = Math.min(
		Number.isSafeInteger(requestedPage) && requestedPage > 0
			? requestedPage
			: 1,
		Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE)),
	);
	const videoRows = await database
		.select({
			id: videos.id,
			name: videos.name,
			ownerId: videos.ownerId,
			ownerName: users.name,
			ownerEmail: users.email,
			orgId: videos.orgId,
			orgName: organizations.name,
			createdAt: videos.createdAt,
			isScreenshot: videos.isScreenshot,
			public: videos.public,
			durationSeconds: videos.duration,
			sourceType: sql<
				string | null
			>`JSON_UNQUOTE(JSON_EXTRACT(${videos.source}, '$.type'))`,
			jobStatus: videos.jobStatus,
			transcriptionStatus: videos.transcriptionStatus,
		})
		.from(videos)
		.leftJoin(users, eq(videos.ownerId, users.id))
		.leftJoin(organizations, eq(videos.orgId, organizations.id))
		.where(where)
		.orderBy(desc(videos.createdAt), desc(videos.id))
		.limit(PAGE_SIZE)
		.offset((page - 1) * PAGE_SIZE);

	const userRows: InstanceUserRow[] = userUsageRows.map((row) => ({
		id: row.id,
		name: row.name,
		email: row.email,
		createdAt: isoDate(row.createdAt),
		whitelisted: isInstanceWhitelisted(row.email),
		...toUsage(row),
		lastRecordingAt: row.lastRecordingAt ? isoDate(row.lastRecordingAt) : null,
	}));
	const trustedUsers = userRows.filter((row) => row.whitelisted).length;

	return {
		summary: {
			users: userRows.length,
			publicUsers: userRows.length - trustedUsers,
			trustedUsers,
			...toUsage(summaryRow),
			publicSignupLimit: getPublicSignupLimit(),
			publicVideoLimit: getPublicVideoLimit(),
		},
		userRows,
		orgs: orgs.map((org) => ({ id: org.id, name: org.name })),
		videos: videoRows.map((row) => ({
			id: row.id,
			name: row.name,
			ownerId: row.ownerId,
			ownerName: row.ownerName,
			ownerEmail: row.ownerEmail,
			orgId: row.orgId,
			orgName: row.orgName,
			createdAt: isoDate(row.createdAt),
			isScreenshot: row.isScreenshot,
			public: row.public,
			durationSeconds: row.isScreenshot
				? null
				: finiteNonnegative(row.durationSeconds),
			sourceType: row.sourceType,
			jobStatus: row.jobStatus,
			transcriptionStatus: row.transcriptionStatus,
		})),
		totalFiltered,
		page,
		pageSize: PAGE_SIZE,
		filters,
	};
}
