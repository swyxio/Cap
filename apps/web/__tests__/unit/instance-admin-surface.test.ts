import { beforeEach, describe, expect, it, vi } from "vitest";
import { getInstanceStorageUsage } from "@/actions/instance-admin";
import { getInstanceRecording } from "@/lib/instance-recording";
import { measureInstanceStorage } from "@/lib/instance-storage";

const mocks = vi.hoisted(() => ({
	authorize: vi.fn(),
	select: vi.fn(),
	run: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/instance-admin", () => ({
	requireInstanceOperator: mocks.authorize,
}));
vi.mock("@/lib/server", () => ({ runPromise: mocks.run }));
vi.mock("@cap/database", () => ({ db: () => ({ select: mocks.select }) }));
vi.mock("@cap/web-backend", () => ({
	provideOptionalAuth: (value: unknown) => value,
	Videos: {},
	S3Buckets: {},
}));
vi.mock("next/navigation", () => ({
	notFound: () => {
		throw new Error("NOT_FOUND");
	},
}));

beforeEach(() => {
	vi.resetAllMocks();
	mocks.authorize.mockResolvedValue({ email: "shawnthe1@gmail.com" });
});

describe("operator-only entrypoints", () => {
	it("does not query data or storage when the storage action is denied", async () => {
		mocks.authorize.mockRejectedValue(new Error("NOT_FOUND"));
		await expect(getInstanceStorageUsage()).rejects.toThrow("NOT_FOUND");
		expect(mocks.select).not.toHaveBeenCalled();
		expect(mocks.run).not.toHaveBeenCalled();
	});
	it("reports unavailable rather than zero when storage setup fails", async () => {
		mocks.select.mockImplementation(() => {
			throw new Error("offline");
		});
		expect(await getInstanceStorageUsage()).toMatchObject({
			status: "unavailable",
		});
	});
	it("returns measured bytes and explicit custom-storage exclusions", async () => {
		mocks.select.mockReturnValueOnce({
			from: async () => [{ id: "owner", email: "owner@example.com" }],
		});
		mocks.select.mockReturnValueOnce({
			from: () => ({ where: async () => [{ count: 2 }] }),
		});
		mocks.run.mockResolvedValue({
			complete: true,
			bytes: 1234,
			objects: 1,
			missingSizes: 0,
			unattributedBytes: 0,
			users: [],
			measuredAt: "2026-08-26T00:00:00.000Z",
		});
		expect(await getInstanceStorageUsage()).toMatchObject({
			status: "available",
			bytes: 1234,
			excludedRecordings: 2,
		});
		expect(mocks.authorize.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.select.mock.invocationCallOrder[0] ?? 0,
		);
	});
	it("does not query a recording or mint links when access is denied", async () => {
		mocks.authorize.mockRejectedValue(new Error("NOT_FOUND"));
		await expect(getInstanceRecording("recording-1")).rejects.toThrow(
			"NOT_FOUND",
		);
		expect(mocks.select).not.toHaveBeenCalled();
		expect(mocks.run).not.toHaveBeenCalled();
	});
	it("rejects invalid recording IDs before database access", async () => {
		await expect(getInstanceRecording("../../other")).rejects.toThrow(
			"NOT_FOUND",
		);
		expect(mocks.select).not.toHaveBeenCalled();
	});
	it("does not mint storage links for missing recordings", async () => {
		const query = {
			leftJoin: () => query,
			where: () => ({ limit: async () => [] }),
		};
		mocks.select.mockReturnValue({ from: () => query });
		await expect(getInstanceRecording("missing")).rejects.toThrow("NOT_FOUND");
		expect(mocks.run).not.toHaveBeenCalled();
	});
});

describe("storage measurement coverage", () => {
	it("paginates and attributes objects without returning object keys", async () => {
		const list = vi
			.fn()
			.mockResolvedValueOnce({
				Contents: [
					{ Key: "a/video/source.mp4", Size: 30 },
					{ Key: "instance-logos/logo.svg", Size: 5 },
				],
				IsTruncated: true,
				NextContinuationToken: "next",
			})
			.mockResolvedValueOnce({
				Contents: [
					{ Key: "a/video/preview.jpg", Size: 2 },
					{ Key: "b/video/result.mp4", Size: 20 },
				],
				IsTruncated: false,
			});
		const result = await measureInstanceStorage(list, [
			{ id: "a", email: "a@example.com" },
			{ id: "b", email: "b@example.com" },
			{ id: "c", email: "c@example.com" },
		]);
		expect(list.mock.calls).toEqual([[undefined], ["next"]]);
		expect(result).toMatchObject({
			complete: true,
			bytes: 57,
			objects: 4,
			missingSizes: 0,
			unattributedBytes: 5,
		});
		expect(result.users.map((u) => [u.id, u.bytes, u.objects])).toEqual([
			["a", 32, 2],
			["b", 20, 1],
			["c", 0, 0],
		]);
		expect(JSON.stringify(result)).not.toContain("source.mp4");
	});
	it("keeps missing, negative, and nonfinite object sizes explicitly unknown", async () => {
		const result = await measureInstanceStorage(
			async () => ({
				Contents: [{ Size: 10 }, {}, { Size: -1 }, { Size: Number.NaN }],
				IsTruncated: false,
			}),
			[],
		);
		expect(result).toMatchObject({
			bytes: 10,
			objects: 4,
			missingSizes: 3,
			complete: true,
		});
	});
	it("reports a partial scan when a truncated page omits its next token", async () => {
		expect(
			await measureInstanceStorage(
				async () => ({ IsTruncated: true, Contents: [{ Size: 20 }] }),
				[],
			),
		).toMatchObject({ complete: false, bytes: 20 });
	});
	it("stops repeated continuation tokens and labels the scan partial", async () => {
		const list = vi.fn().mockResolvedValue({
			IsTruncated: true,
			NextContinuationToken: "repeat",
			Contents: [],
		});
		expect(await measureInstanceStorage(list, [])).toMatchObject({
			complete: false,
		});
		expect(list).toHaveBeenCalledTimes(2);
	});
	it("bounds a large scan without presenting a partial total as complete", async () => {
		let page = 0;
		const list = vi.fn(async () => ({
			IsTruncated: true,
			NextContinuationToken: String(++page),
			Contents: [{ Size: 1 }],
		}));
		expect(await measureInstanceStorage(list, [])).toMatchObject({
			complete: false,
			bytes: 100,
		});
		expect(list).toHaveBeenCalledTimes(100);
	});
	it("propagates provider errors rather than inventing an empty bucket", async () => {
		await expect(
			measureInstanceStorage(async () => {
				throw new Error("provider unavailable");
			}, []),
		).rejects.toThrow("provider unavailable");
	});
	it("represents a successfully scanned empty bucket as zero", async () => {
		expect(
			await measureInstanceStorage(async () => ({ IsTruncated: false }), []),
		).toMatchObject({ complete: true, objects: 0, bytes: 0, missingSizes: 0 });
	});
});
