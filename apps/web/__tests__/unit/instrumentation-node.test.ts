import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	migrateDb: vi.fn<() => Promise<void>>(),
	setupInstanceOrganizations: vi.fn<() => Promise<void>>(),
	setupInstanceLogos: vi.fn<() => Promise<void>>(),
	delay: vi.fn<() => Promise<void>>(),
	start: vi.fn<() => Promise<void>>(),
	createWorld: vi.fn(),
	setWorld: vi.fn(),
	buildEnv: {
		NEXT_PUBLIC_IS_CAP: "false",
		NEXT_PUBLIC_DOCKER_BUILD: "true",
	},
}));

vi.mock("node:timers/promises", () => ({ setTimeout: mocks.delay }));
vi.mock("@cap/database/migrate", () => ({ migrateDb: mocks.migrateDb }));
vi.mock("@cap/database/instance-setup", () => ({
	setupInstanceOrganizations: mocks.setupInstanceOrganizations,
}));
vi.mock("@cap/env", () => ({ buildEnv: mocks.buildEnv }));
vi.mock("../../lib/instance-logos", () => ({
	setupInstanceLogos: mocks.setupInstanceLogos,
}));
vi.mock("@workflow/world-postgres", () => ({
	createWorld: mocks.createWorld,
}));
vi.mock("workflow/runtime", () => ({ setWorld: mocks.setWorld }));

import { register } from "../../instrumentation.node";

describe("self-hosted server startup", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		vi.stubEnv("NEXT_PHASE", "phase-production-server");
		vi.stubEnv("WORKFLOW_TARGET_WORLD", "@workflow/world-postgres");
		vi.stubEnv("WORKFLOW_POSTGRES_URL", "postgres://localhost/cap-workflows");
		mocks.buildEnv.NEXT_PUBLIC_IS_CAP = "false";
		mocks.buildEnv.NEXT_PUBLIC_DOCKER_BUILD = "true";
		mocks.migrateDb.mockResolvedValue();
		mocks.setupInstanceOrganizations.mockResolvedValue();
		mocks.setupInstanceLogos.mockResolvedValue();
		mocks.delay.mockResolvedValue();
		mocks.start.mockResolvedValue();
		mocks.createWorld.mockReturnValue({ start: mocks.start });
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("waits for migrations and workflow startup before becoming ready", async () => {
		let finishMigration = () => {};
		let finishStartup = () => {};
		mocks.migrateDb.mockReturnValue(
			new Promise<void>((resolve) => {
				finishMigration = resolve;
			}),
		);
		mocks.start.mockReturnValue(
			new Promise<void>((resolve) => {
				finishStartup = resolve;
			}),
		);
		const ready = vi.fn();
		const startup = register().then(ready);
		expect(mocks.createWorld).not.toHaveBeenCalled();
		finishMigration();
		await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
		expect(mocks.setupInstanceOrganizations).toHaveBeenCalledOnce();
		expect(mocks.setupInstanceLogos.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.setupInstanceOrganizations.mock.invocationCallOrder[0] ?? 0,
		);
		expect(mocks.setWorld).toHaveBeenCalledWith({ start: mocks.start });
		expect(ready).not.toHaveBeenCalled();
		finishStartup();
		await startup;
		expect(ready).toHaveBeenCalledOnce();
	});

	it("does not provision organizations or become ready if logo upload fails", async () => {
		mocks.setupInstanceLogos.mockRejectedValue(
			new Error("storage unavailable"),
		);
		await expect(register()).rejects.toThrow("storage unavailable");
		expect(mocks.setupInstanceOrganizations).not.toHaveBeenCalled();
		expect(mocks.createWorld).not.toHaveBeenCalled();
	});

	it("does not become ready if organization setup fails", async () => {
		mocks.setupInstanceOrganizations.mockRejectedValue(
			new Error("canonical owner missing"),
		);
		await expect(register()).rejects.toThrow("canonical owner missing");
		expect(mocks.createWorld).not.toHaveBeenCalled();
	});

	it("retries transient migration failures before starting the worker", async () => {
		mocks.migrateDb.mockRejectedValueOnce(new Error("database starting"));
		await register();
		expect(mocks.migrateDb).toHaveBeenCalledTimes(2);
		expect(mocks.delay).toHaveBeenCalledWith(5000);
		expect(mocks.start).toHaveBeenCalledOnce();
	});

	it("fails startup after three migration failures without starting the worker", async () => {
		const error = new Error("migration failed");
		mocks.migrateDb.mockRejectedValue(error);
		await expect(register()).rejects.toThrow(error);
		expect(mocks.migrateDb).toHaveBeenCalledTimes(3);
		expect(mocks.delay).toHaveBeenCalledTimes(2);
		expect(mocks.createWorld).not.toHaveBeenCalled();
	});

	it("propagates worker startup failure", async () => {
		mocks.start.mockRejectedValue(new Error("workflow database unavailable"));
		await expect(register()).rejects.toThrow("workflow database unavailable");
	});

	it("requires the explicit workflow database URL", async () => {
		vi.stubEnv("WORKFLOW_POSTGRES_URL", "");
		await expect(register()).rejects.toThrow(
			"WORKFLOW_POSTGRES_URL is required",
		);
		expect(mocks.createWorld).not.toHaveBeenCalled();
	});

	it("does not connect to databases during a production build", async () => {
		vi.stubEnv("NEXT_PHASE", "phase-production-build");
		await register();
		expect(mocks.migrateDb).not.toHaveBeenCalled();
		expect(mocks.setupInstanceLogos).not.toHaveBeenCalled();
		expect(mocks.createWorld).not.toHaveBeenCalled();
	});

	it("does not apply self-hosted startup to the managed Cap service", async () => {
		mocks.buildEnv.NEXT_PUBLIC_IS_CAP = "true";
		await register();
		expect(mocks.migrateDb).not.toHaveBeenCalled();
		expect(mocks.createWorld).not.toHaveBeenCalled();
	});

	it("does not start Postgres when another world is configured", async () => {
		vi.stubEnv("WORKFLOW_TARGET_WORLD", "local");
		await register();
		expect(mocks.migrateDb).toHaveBeenCalledOnce();
		expect(mocks.createWorld).not.toHaveBeenCalled();
	});
});
