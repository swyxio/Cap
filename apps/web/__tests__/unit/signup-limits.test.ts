import {
	assertNewUserAllowed,
	getSignupDenial,
	lockInstanceSignups,
	PublicSignupFullError,
} from "@cap/database/signup-limits";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
	CAP_PUBLIC_SIGNUP_LIMIT: 100,
	CAP_PUBLIC_VIDEO_LIMIT: 25,
	CAP_ALLOWED_SIGNUP_DOMAINS:
		"ai.engineer,latent.space,smol.ai,shawnthe1@gmail.com,swyx@cognition.ai",
}));
vi.mock("@cap/env", () => ({ serverEnv: () => env }));

const accounts = (count: number) => [
	...Array.from({ length: count }, (_, i) => ({
		email: `guest${i}@example.com`,
	})),
	{ email: "someone@latent.space" },
	{ email: "swyx@cognition.ai" },
];

function transaction(count: number) {
	const lockingRead = vi.fn().mockResolvedValue(accounts(count));
	const updateGuard = vi.fn().mockResolvedValue(undefined);
	const tx = {
		select: () => ({ from: () => ({ for: lockingRead }) }),
		insert: () => ({ values: () => ({ onDuplicateKeyUpdate: updateGuard }) }),
	};
	return {
		tx: tx as unknown as Parameters<typeof assertNewUserAllowed>[0],
		lockingRead,
		updateGuard,
	};
}

function database(count: number, existing = false) {
	const select = vi
		.fn()
		.mockReturnValueOnce({
			from: () => ({
				where: () => ({
					limit: async () => (existing ? [{ id: "existing" }] : []),
				}),
			}),
		})
		.mockReturnValueOnce({ from: async () => accounts(count) });
	return { select } as unknown as Parameters<typeof getSignupDenial>[0];
}

describe("public signup limits", () => {
	beforeEach(() => {
		env.CAP_PUBLIC_SIGNUP_LIMIT = 100;
	});

	it("locks the shared signup guard for the surrounding transaction", async () => {
		const { tx, updateGuard } = transaction(99);
		await lockInstanceSignups(tx);
		expect(updateGuard).toHaveBeenCalledWith({ set: { id: "public-signups" } });
	});

	it("allows the 100th public account without counting whitelisted accounts", async () => {
		const { tx, lockingRead } = transaction(99);
		await expect(
			assertNewUserAllowed(tx, "new@example.com"),
		).resolves.toBeUndefined();
		expect(lockingRead).toHaveBeenCalledWith("update");
	});

	it("refuses the 101st public account", async () => {
		await expect(
			assertNewUserAllowed(transaction(100).tx, "new@example.com"),
		).rejects.toBeInstanceOf(PublicSignupFullError);
	});

	it.each([
		"person@ai.engineer",
		"person@latent.space",
		"person@smol.ai",
		"shawnthe1@gmail.com",
		"SWYX@COGNITION.AI",
	])("admits whitelisted %s when public capacity is full", async (email) => {
		const { tx, lockingRead } = transaction(100);
		await assertNewUserAllowed(tx, email);
		expect(lockingRead).not.toHaveBeenCalled();
	});

	it("keeps new public registrations closed until quota activation", async () => {
		env.CAP_PUBLIC_SIGNUP_LIMIT = 0;
		await expect(
			assertNewUserAllowed(transaction(0).tx, "new@example.com"),
		).rejects.toThrow("not approved");
	});

	it("allows existing accounts to sign in when public signup is full", async () => {
		await expect(
			getSignupDenial(database(100, true), "existing@example.com"),
		).resolves.toBeNull();
	});

	it("explains a full public signup before starting authorization", async () => {
		await expect(
			getSignupDenial(database(100), "new@example.com"),
		).resolves.toBe("PublicSignupFull");
	});
});
