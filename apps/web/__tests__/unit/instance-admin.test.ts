import type { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	getInstanceOverview,
	requireInstanceOperator,
} from "@/lib/instance-admin";
import { isInstanceOperatorEmail } from "../../../../packages/database/instance-operator";

const state = vi.hoisted(() => ({
	managedCap: undefined as string | undefined,
	enabled: true,
	currentUser: vi.fn(),
	select: vi.fn(),
	database: vi.fn(),
	notFound: vi.fn((): never => {
		throw new Error("NEXT_NOT_FOUND");
	}),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: state.notFound }));
vi.mock("@cap/env", () => ({
	buildEnv: {
		get NEXT_PUBLIC_IS_CAP() {
			return state.managedCap;
		},
	},
	serverEnv: () => ({ CAP_DOMAIN_ORGANIZATIONS_ENABLED: state.enabled }),
}));
vi.mock("@cap/database", () => ({ db: state.database }));
vi.mock("@cap/database/auth/session", () => ({
	getCurrentUser: state.currentUser,
}));
vi.mock("@cap/database/instance-policy", () => ({
	getPublicSignupLimit: () => 100,
	getPublicVideoLimit: () => 25,
	isInstanceWhitelisted: (email: string) =>
		email.endsWith("@ai.engineer") || email === "shawnthe1@gmail.com",
}));

type Row = Record<string, unknown>;
type Dataset = "users" | "orgs" | "summary" | "filtered" | "videos";
type Query = {
	dataset: Dataset;
	fields: Record<string, unknown>;
	where?: SQL;
	limit?: number;
	offset?: number;
	joins: number;
	grouped: boolean;
};
const queries: Query[] = [];
let rows: Record<Dataset, Row[]>;
const date = new Date("2026-08-27T08:00:00Z");
const usage = {
	recordings: "2",
	screenshots: "1",
	durationSeconds: "65.5",
	knownDurationCount: "1",
};

function builder(fields: Record<string, unknown>) {
	const dataset: Dataset =
		"ownerId" in fields
			? "videos"
			: "email" in fields
				? "users"
				: "recordings" in fields
					? "summary"
					: "total" in fields
						? "filtered"
						: "orgs";
	const query: Query = { dataset, fields, joins: 0, grouped: false };
	queries.push(query);
	const chain = Object.assign(Promise.resolve(rows[dataset]), {
		from: () => chain,
		leftJoin: () => {
			query.joins += 1;
			return chain;
		},
		groupBy: () => {
			query.grouped = true;
			return chain;
		},
		orderBy: () => chain,
		where: (where?: SQL) => {
			query.where = where;
			return chain;
		},
		limit: (limit: number) => {
			query.limit = limit;
			return chain;
		},
		offset: (offset: number) => {
			query.offset = offset;
			return chain;
		},
	});
	return chain;
}

beforeEach(() => {
	state.managedCap = undefined;
	state.enabled = true;
	state.currentUser.mockResolvedValue({
		id: "operator",
		email: "shawnthe1@gmail.com",
		secret: "session-secret",
	});
	state.database.mockReturnValue({ select: state.select });
	state.select.mockImplementation(builder);
	queries.length = 0;
	rows = {
		users: [
			{
				id: "owner",
				name: "swyx",
				email: "shawnthe1@gmail.com",
				createdAt: date,
				...usage,
				lastRecordingAt: date,
				password: "do-not-export",
			},
			{
				id: "unused",
				name: null,
				email: "new@example.com",
				createdAt: date,
				recordings: "0",
				screenshots: "0",
				durationSeconds: null,
				knownDurationCount: "0",
				lastRecordingAt: null,
			},
		],
		orgs: [{ id: "swyx-aie", name: "AIE", metadata: "do-not-export" }],
		summary: [{ ...usage }],
		filtered: [{ total: 3 }],
		videos: [
			{
				id: "recording",
				name: "Example",
				ownerId: "owner",
				ownerName: "swyx",
				ownerEmail: "shawnthe1@gmail.com",
				orgId: "swyx-aie",
				orgName: "AIE",
				createdAt: date,
				isScreenshot: false,
				public: false,
				durationSeconds: 65.5,
				sourceType: "desktopMP4",
				jobStatus: "COMPLETE",
				transcriptionStatus: "COMPLETE",
				password: "do-not-export",
				metadata: { secret: "do-not-export" },
				access_token: "do-not-export",
			},
		],
	};
});

describe("instance operator authorization", () => {
	it("allows the operator when managed Cap is explicitly false", async () => {
		state.managedCap = "false";
		expect(await requireInstanceOperator()).toMatchObject({
			email: "shawnthe1@gmail.com",
		});
		expect(state.database).not.toHaveBeenCalled();
	});

	it.each(["shawnthe1@gmail.com", " SWYX@COGNITION.AI "])(
		"allows the exact operator identity %s",
		async (email) => {
			expect(isInstanceOperatorEmail(email)).toBe(true);
			const operator = { id: "operator", email, name: "swyx" };
			state.currentUser.mockResolvedValueOnce(operator);
			expect(await requireInstanceOperator()).toBe(operator);
			expect(state.database).not.toHaveBeenCalled();
		},
	);

	it.each([
		"member@ai.engineer",
		"member@latent.space",
		"member@smol.ai",
		"colleague@cognition.ai",
		"shawnthe1+alias@gmail.com",
		"swyx@cognition.ai.attacker.example",
		"swyx@cognition.ai@evil.example",
		"",
	])("denies %s before any overview query", async (email) => {
		expect(isInstanceOperatorEmail(email)).toBe(false);
		state.currentUser.mockResolvedValueOnce({ id: "not-operator", email });
		await expect(getInstanceOverview()).rejects.toThrow("NEXT_NOT_FOUND");
		expect(state.database).not.toHaveBeenCalled();
		expect(state.select).not.toHaveBeenCalled();
	});

	it("denies anonymous visitors before overview queries", async () => {
		state.currentUser.mockResolvedValueOnce(null);
		await expect(getInstanceOverview()).rejects.toThrow("NEXT_NOT_FOUND");
		expect(state.database).not.toHaveBeenCalled();
	});

	it.each(["managed", "disabled"])(
		"denies the operator on a %s instance",
		async (mode) => {
			if (mode === "managed") state.managedCap = "true";
			else state.enabled = false;
			await expect(getInstanceOverview()).rejects.toThrow("NEXT_NOT_FOUND");
			expect(state.database).not.toHaveBeenCalled();
			expect(state.currentUser).not.toHaveBeenCalled();
		},
	);
});

describe("instance overview", () => {
	it("returns all users including zero-usage accounts and only minimal serializable DTOs", async () => {
		const result = await getInstanceOverview();
		expect(result.summary).toEqual({
			users: 2,
			trustedUsers: 1,
			publicUsers: 1,
			recordings: 2,
			screenshots: 1,
			durationSeconds: 65.5,
			knownDurationCount: 1,
			publicSignupLimit: 100,
			publicVideoLimit: 25,
		});
		expect(result.userRows[1]).toEqual({
			id: "unused",
			name: null,
			email: "new@example.com",
			createdAt: date.toISOString(),
			whitelisted: false,
			recordings: 0,
			screenshots: 0,
			durationSeconds: null,
			knownDurationCount: 0,
			lastRecordingAt: null,
		});
		expect(result.userRows[0]?.lastRecordingAt).toBe(date.toISOString());
		expect(result.videos[0]?.createdAt).toBe(date.toISOString());
		expect(result.orgs).toEqual([{ id: "swyx-aie", name: "AIE" }]);
		expect(JSON.stringify(result)).not.toContain("do-not-export");
		expect(JSON.stringify(result)).not.toContain("session-secret");
		expect(queries.find((query) => query.dataset === "users")).toMatchObject({
			joins: 1,
			grouped: true,
		});
		const videoFields = Object.keys(
			queries.find((query) => query.dataset === "videos")?.fields ?? {},
		);
		expect(videoFields).not.toContain("password");
		expect(videoFields).not.toContain("metadata");
		expect(videoFields).not.toContain("source");
	});

	it("escapes literal search wildcards and applies owner, organization, and kind filters to count and page", async () => {
		const result = await getInstanceOverview({
			q: "  50%_done!  ",
			userId: " owner ",
			orgId: " swyx-aie ",
			kind: "screenshots",
			page: "2",
		});
		expect(result.filters).toEqual({
			q: "50%_done!",
			userId: "owner",
			orgId: "swyx-aie",
			kind: "screenshots",
		});
		const filtered = queries.find(
			(query) => query.dataset === "filtered",
		)?.where;
		const paginated = queries.find(
			(query) => query.dataset === "videos",
		)?.where;
		expect(filtered).toBe(paginated);
		if (!filtered) throw new Error("Missing filters");
		const compiled = new MySqlDialect().sqlToQuery(filtered);
		expect(compiled.params).toEqual([
			"owner",
			"swyx-aie",
			true,
			"%50!%!_done!!%",
			"%50!%!_done!!%",
			"%50!%!_done!!%",
		]);
		expect(compiled.sql).toContain("ESCAPE '!'");
		expect(compiled.sql).not.toContain("50%");
	});

	it("paginates 50 rows and clamps oversized page requests", async () => {
		rows.filtered = [{ total: "101" }];
		const result = await getInstanceOverview({ page: "999" });
		expect(result).toMatchObject({ page: 3, pageSize: 50, totalFiltered: 101 });
		expect(queries.find((query) => query.dataset === "videos")).toMatchObject({
			limit: 50,
			offset: 100,
		});
	});

	it.each(["-1", "0", "1.5", "NaN", "9007199254740992"])(
		"normalizes invalid page %s",
		async (page) => {
			rows.filtered = [{ total: 150 }];
			expect((await getInstanceOverview({ page, kind: "invalid" })).page).toBe(
				1,
			);
			expect(queries.find((query) => query.dataset === "videos")?.offset).toBe(
				0,
			);
		},
	);

	it.each([null, Number.NaN, Number.POSITIVE_INFINITY, -1])(
		"keeps missing or invalid durations unavailable (%s)",
		async (durationSeconds) => {
			rows.summary = [{ ...usage, durationSeconds }];
			rows.videos = [{ ...rows.videos[0], durationSeconds }];
			const result = await getInstanceOverview();
			expect(result.summary.durationSeconds).toBeNull();
			expect(result.videos[0]?.durationSeconds).toBeNull();
		},
	);

	it("does not call screenshots timed recordings", async () => {
		rows.videos = [
			{ ...rows.videos[0], isScreenshot: true, durationSeconds: 42 },
		];
		const result = await getInstanceOverview({ kind: "recordings" });
		expect(result.videos[0]?.durationSeconds).toBeNull();
		const aggregate = queries.find((query) => query.dataset === "summary")
			?.fields.durationSeconds as SQL;
		const compiled = new MySqlDialect().sqlToQuery(aggregate);
		expect(compiled.sql).toContain("isScreenshot");
		expect(compiled.sql).toContain("duration");
	});

	it("reports a failed aggregate as unavailable, never an empty successful dashboard", async () => {
		rows.summary = [];
		await expect(getInstanceOverview()).rejects.toThrow(
			"summary is unavailable",
		);
		expect(queries.some((query) => query.dataset === "videos")).toBe(false);
	});

	it("rejects nonfinite aggregate counts", async () => {
		rows.filtered = [{ total: Number.NaN }];
		await expect(getInstanceOverview()).rejects.toThrow("count is unavailable");
	});
});
