import {
	insertVideoWithLimit,
	VideoLimitError,
} from "@cap/database/video-limits";
import { Effect, Option } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const policy = vi.hoisted(() => ({ limit: 25, whitelisted: false }));
const transaction = vi.hoisted(() => vi.fn());

vi.mock("@cap/database", () => ({ db: () => ({ transaction }) }));
vi.mock("@cap/database/auth/session", () => ({
	getCurrentUser: async () => ({ id: "owner-id", email: "guest@example.com" }),
}));
vi.mock("@cap/env", () => ({
	serverEnv: () => ({ CAP_VIDEOS_DEFAULT_PUBLIC: false }),
}));
vi.mock("@cap/utils", () => ({ userIsPro: () => true }));
vi.mock("@/actions/organization/authorization", () => ({
	requireOrganizationAccess: async () => {},
}));
vi.mock("@/lib/server", () => ({
	runPromise: (value: Effect.Effect<unknown>) => Effect.runPromise(value),
}));
vi.mock("@cap/web-backend", () => ({
	Storage: {
		createUploadTargetForUser: () =>
			Effect.succeed({
				bucketId: Option.none(),
				storageIntegrationId: Option.none(),
				upload: { type: "s3Put", url: "https://upload.invalid" },
			}),
	},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@cap/database/instance-policy", () => ({
	getPublicVideoLimit: () => policy.limit,
	isInstanceWhitelisted: () => policy.whitelisted,
}));

type Transaction = Parameters<typeof insertVideoWithLimit>[0];
const data = {
	id: "video-id",
	ownerId: "owner-id",
	orgId: "org-id",
	name: "Recording",
} as Parameters<typeof insertVideoWithLimit>[1];

function createTransaction(storedCount: number, ownerExists = true) {
	const events: string[] = [];
	let read = 0;
	const values = vi.fn(async () => {
		events.push("insert");
	});
	const tx = {
		select: vi.fn(() => {
			read++;
			return tx;
		}),
		from: vi.fn(() => tx),
		where: vi.fn(() => tx),
		limit: vi.fn(() => tx),
		for: vi.fn(async (mode: string) => {
			events.push(`${read === 1 ? "owner" : "videos"}:${mode}`);
			return read === 1
				? ownerExists
					? [{ email: "guest@example.com" }]
					: []
				: Array.from({ length: storedCount }, (_, id) => ({ id }));
		}),
		insert: vi.fn(() => ({ values })),
	};
	return { tx: tx as unknown as Transaction, events, values, query: tx };
}

describe("public stored-video limit", () => {
	beforeEach(() => {
		policy.limit = 25;
		policy.whitelisted = false;
	});

	it("locks the owner, reads current videos, then inserts the 25th video", async () => {
		const { tx, events, values, query } = createTransaction(24);
		await insertVideoWithLimit(tx, data);
		expect(events).toEqual(["owner:update", "videos:update", "insert"]);
		expect(query.limit).toHaveBeenCalledWith(25);
		expect(values).toHaveBeenCalledWith(data);
	});

	it("rejects the 26th stored video before insertion with an actionable error", async () => {
		const { tx, values } = createTransaction(25);
		await expect(insertVideoWithLimit(tx, data)).rejects.toMatchObject({
			code: "video_limit_reached",
			limit: 25,
			message: expect.stringContaining("Delete a recording or ask swyx"),
		});
		expect(values).not.toHaveBeenCalled();
	});

	it("frees capacity when a stored video has been deleted", async () => {
		await expect(
			insertVideoWithLimit(createTransaction(25).tx, data),
		).rejects.toBeInstanceOf(VideoLimitError);
		const afterDelete = createTransaction(24);
		await insertVideoWithLimit(afterDelete.tx, data);
		expect(afterDelete.values).toHaveBeenCalledOnce();
	});

	it("exempts whitelisted owners without counting their videos", async () => {
		policy.whitelisted = true;
		const { tx, events } = createTransaction(200);
		await insertVideoWithLimit(tx, data);
		expect(events).toEqual(["owner:update", "insert"]);
	});

	it("fails closed if the owner no longer exists", async () => {
		const { tx, values } = createTransaction(0, false);
		await expect(insertVideoWithLimit(tx, data)).rejects.toThrow(
			"Video owner not found",
		);
		expect(values).not.toHaveBeenCalled();
	});

	it("does not enforce an unconfigured public limit", async () => {
		policy.limit = 0;
		const { tx, events } = createTransaction(200);
		await insertVideoWithLimit(tx, data);
		expect(events).toEqual(["insert"]);
	});

	it("returns the quota message from upload actions instead of a production-scrubbed exception", async () => {
		transaction.mockRejectedValue(new VideoLimitError(25));
		const { createVideoAndGetUploadUrl } = await import(
			"@/actions/video/upload"
		);
		const { createVideoForServerProcessing } = await import(
			"@/actions/video/create-for-processing"
		);
		for (const action of [
			createVideoAndGetUploadUrl,
			createVideoForServerProcessing,
		]) {
			await expect(action({ orgId: data.orgId })).resolves.toEqual({
				error: expect.stringContaining("Delete a recording or ask swyx"),
			});
		}
	});
});
