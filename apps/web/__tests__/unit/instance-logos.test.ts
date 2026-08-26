import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupInstanceLogos } from "../../lib/instance-logos";

const mocks = vi.hoisted(() => ({
	enabled: true,
	readFile: vi.fn(),
	putObject: vi.fn(),
	getBucketAccess: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));
vi.mock("@cap/env", () => ({
	serverEnv: () => ({ CAP_DOMAIN_ORGANIZATIONS_ENABLED: mocks.enabled }),
}));
vi.mock("@cap/web-backend/src/S3Buckets/index", async () => {
	const { Effect } = await import("effect");
	class S3Buckets extends Effect.Service<S3Buckets>()("S3Buckets", {
		succeed: { getBucketAccess: mocks.getBucketAccess },
	}) {}
	return { S3Buckets };
});

beforeEach(() => {
	vi.resetAllMocks();
	mocks.enabled = true;
	mocks.readFile.mockResolvedValue(Buffer.from("logo"));
	mocks.putObject.mockReturnValue(Effect.void);
	mocks.getBucketAccess.mockReturnValue(
		Effect.succeed([{ putObject: mocks.putObject }]),
	);
});

describe("instance logo storage", () => {
	it("uploads bundled bytes to the default bucket keys with correct content types", async () => {
		await setupInstanceLogos();
		expect(mocks.getBucketAccess).toHaveBeenCalledWith();
		expect(mocks.putObject.mock.calls).toEqual([
			[
				"instance-logos/aie.svg",
				Buffer.from("logo"),
				{ contentType: "image/svg+xml", contentLength: 4 },
			],
			[
				"instance-logos/latent-space.png",
				Buffer.from("logo"),
				{ contentType: "image/png", contentLength: 4 },
			],
			[
				"instance-logos/smol.svg",
				Buffer.from("logo"),
				{ contentType: "image/svg+xml", contentLength: 4 },
			],
		]);
		expect(mocks.readFile.mock.calls.map(([path]) => path)).toEqual([
			`${process.cwd()}/public/instance-logos/aie.svg`,
			`${process.cwd()}/public/instance-logos/latent-space.png`,
			`${process.cwd()}/public/instance-logos/smol.svg`,
		]);
	});

	it("does not access storage when instance organizations are disabled", async () => {
		mocks.enabled = false;
		await setupInstanceLogos();
		expect(mocks.getBucketAccess).not.toHaveBeenCalled();
		expect(mocks.readFile).not.toHaveBeenCalled();
	});

	it("propagates storage failure instead of reporting successful setup", async () => {
		mocks.putObject.mockReturnValue(
			Effect.fail(new Error("storage unavailable")),
		);
		await expect(setupInstanceLogos()).rejects.toThrow("storage unavailable");
		expect(mocks.putObject).toHaveBeenCalledTimes(1);
	});
});
