import { User } from "@cap/web-domain";
import { getTableName } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	ensureInstanceOrganizations,
	INSTANCE_ORGANIZATIONS,
	joinInstanceOrganizations,
} from "../../../../packages/database/instance-organizations";

const settings = vi.hoisted(() => ({
	CAP_DOMAIN_ORGANIZATIONS_ENABLED: true,
	WEB_URL: "https://cap.swyx.io",
}));

vi.mock("@cap/env", () => ({ serverEnv: () => settings }));

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;

vi.mock("drizzle-orm", async (importOriginal) => ({
	...(await importOriginal<typeof import("drizzle-orm")>()),
	eq: (column: { name: string }, value: unknown) => (row: Row) =>
		row[column.name] === value,
	and:
		(...predicates: Predicate[]) =>
		(row: Row) =>
			predicates.every((predicate) => predicate(row)),
}));

const ownerId = User.UserId.make("owner");

function database(initial: Record<string, Row[]> = {}) {
	const rows: Record<string, Row[]> = {
		users: [{ id: ownerId, email: "shawnthe1@gmail.com" }],
		organizations: [],
		organization_members: [],
		...initial,
	};
	const db = {
		select: vi.fn((fields?: Record<string, { name: string }>) => ({
			from: (table: Parameters<typeof getTableName>[0]) => ({
				where: (predicate: Predicate) => ({
					limit: async (count: number) =>
						rows[getTableName(table)]
							?.filter(predicate)
							.slice(0, count)
							.map((row) =>
								fields
									? Object.fromEntries(
											Object.entries(fields).map(([name, column]) => [
												name,
												row[column.name],
											]),
										)
									: { ...row },
							) ?? [],
				}),
			}),
		})),
		insert: vi.fn((table: Parameters<typeof getTableName>[0]) => ({
			values: (value: Row) => ({
				onDuplicateKeyUpdate: async () => {
					const target = rows[getTableName(table)];
					if (!target) throw new Error("Unknown table");
					if (!target.some((row) => row.id === value.id)) {
						target.push({ ...value });
					}
				},
			}),
		})),
		update: vi.fn((table: Parameters<typeof getTableName>[0]) => ({
			set: (value: Row) => ({
				where: async (predicate: Predicate) => {
					for (const row of rows[getTableName(table)] ?? []) {
						if (predicate(row)) Object.assign(row, value);
					}
				},
			}),
		})),
	};
	return {
		rows,
		db,
		tx: db as unknown as MySql2Database,
	};
}

describe("instance organizations", () => {
	beforeEach(() => {
		settings.CAP_DOMAIN_ORGANIZATIONS_ENABLED = true;
	});

	it("does not query or change the database when disabled", async () => {
		settings.CAP_DOMAIN_ORGANIZATIONS_ENABLED = false;
		const { db, tx } = database();
		await ensureInstanceOrganizations(tx, ownerId);
		expect(
			await joinInstanceOrganizations(tx, {
				id: ownerId,
				email: "shawnthe1@gmail.com",
			}),
		).toBeNull();
		expect(db.select).not.toHaveBeenCalled();
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("seeds branded organizations and canonical owner memberships idempotently", async () => {
		const { rows, tx } = database();
		await ensureInstanceOrganizations(tx, ownerId);
		await ensureInstanceOrganizations(tx, ownerId);
		expect(rows.organizations).toHaveLength(3);
		expect(rows.organizations).toEqual(
			INSTANCE_ORGANIZATIONS.map((organization) => ({
				id: organization.id,
				name: organization.name,
				ownerId,
				iconUrl: organization.logoPath.slice(1),
			})),
		);
		expect(rows.organization_members).toHaveLength(3);
		for (const member of rows.organization_members ?? []) {
			expect(member).toMatchObject({ userId: ownerId, role: "owner" });
			expect(String(member.id).length).toBeLessThanOrEqual(15);
		}
	});

	it("preserves existing organization details and playback restrictions", async () => {
		const existing = {
			id: "swyx-aie",
			ownerId,
			name: "Updated AIE name",
			iconUrl: "https://example.com/custom.svg",
			allowedEmailDomain: "existing.example",
		};
		const { rows, tx } = database({ organizations: [{ ...existing }] });
		await ensureInstanceOrganizations(tx, ownerId);
		expect(rows.organizations?.[0]).toEqual(existing);
	});

	it.each([
		["person@ai.engineer", "swyx-aie"],
		[" Person@LATENT.SPACE ", "swyx-latent"],
		["person@smol.ai", "swyx-smol"],
	])("joins %s to the matching organization", async (email, expectedId) => {
		const user = { id: User.UserId.make("new-member"), email };
		const { rows, tx } = database();
		expect(await joinInstanceOrganizations(tx, user)).toBe(expectedId);
		await joinInstanceOrganizations(tx, user);
		expect(
			rows.organization_members?.filter((row) => row.userId === user.id),
		).toEqual([
			expect.objectContaining({ organizationId: expectedId, role: "member" }),
		]);
	});

	it.each([
		"outsider@gmail.com",
		"someone@cognition.ai",
		"person@sub.ai.engineer",
		"person@notai.engineer",
		"ai.engineer@attacker.example",
		"fake@person@ai.engineer",
		"@ai.engineer",
	])("does not enroll an unmatched or malformed email %s", async (email) => {
		const { db, tx } = database();
		expect(
			await joinInstanceOrganizations(tx, {
				id: User.UserId.make("outsider"),
				email,
			}),
		).toBeNull();
		expect(db.select).not.toHaveBeenCalled();
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("gives the exact alternate owner email admin access to all three organizations", async () => {
		const { rows, tx } = database();
		await joinInstanceOrganizations(tx, {
			id: User.UserId.make("alternate-owner"),
			email: "SWYX@cognition.ai",
		});
		expect(
			rows.organization_members?.filter(
				(row) => row.userId === "alternate-owner",
			),
		).toEqual(
			INSTANCE_ORGANIZATIONS.map((organization) =>
				expect.objectContaining({
					organizationId: organization.id,
					role: "admin",
				}),
			),
		);
		expect(rows.organizations?.every((row) => row.ownerId === ownerId)).toBe(
			true,
		);
	});

	it("does not downgrade existing admin membership or duplicate its old random id", async () => {
		const user = { id: User.UserId.make("member"), email: "member@smol.ai" };
		const existing = {
			id: "old-random-id",
			organizationId: "swyx-smol",
			userId: user.id,
			role: "admin",
		};
		const { rows, tx } = database({ organization_members: [{ ...existing }] });
		await joinInstanceOrganizations(tx, user);
		expect(
			rows.organization_members?.filter((row) => row.userId === user.id),
		).toEqual([existing]);
	});

	it("promotes an existing alternate owner membership to admin", async () => {
		const user = {
			id: User.UserId.make("alternate"),
			email: "swyx@cognition.ai",
		};
		const { rows, tx } = database({
			organization_members: [
				{
					id: "existing-member",
					organizationId: "swyx-smol",
					userId: user.id,
					role: "member",
				},
			],
		});
		await joinInstanceOrganizations(tx, user);
		expect(
			rows.organization_members?.find((row) => row.id === "existing-member")
				?.role,
		).toBe("admin");
	});

	it("only chooses a default organization when explicitly provisioning a new user", async () => {
		const user = {
			id: User.UserId.make("member"),
			email: "member@smol.ai",
			activeOrganizationId: "personal",
			defaultOrgId: "personal",
		};
		const { rows, tx } = database({
			users: [{ id: ownerId, email: "shawnthe1@gmail.com" }, { ...user }],
		});
		await joinInstanceOrganizations(tx, user);
		expect(rows.users?.[1]).toEqual(user);
		await joinInstanceOrganizations(tx, user, { setDefaultOrganization: true });
		expect(rows.users?.[1]).toMatchObject({
			activeOrganizationId: "swyx-smol",
			defaultOrgId: "swyx-smol",
		});
	});

	it("rejects provisioning without the canonical existing owner", async () => {
		const { db, tx } = database({ users: [] });
		await expect(ensureInstanceOrganizations(tx, ownerId)).rejects.toThrow(
			"canonical instance owner",
		);
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("rejects a colliding organization belonging to someone else", async () => {
		const { tx } = database({
			organizations: [
				{
					id: "swyx-aie",
					ownerId: "someone-else",
				},
			],
		});
		await expect(ensureInstanceOrganizations(tx, ownerId)).rejects.toThrow(
			"another owner",
		);
	});

	it("does not resurrect deleted organizations", async () => {
		const { rows, tx } = database({
			organizations: [
				{
					id: "swyx-aie",
					ownerId,
					tombstoneAt: new Date("2026-01-01"),
				},
			],
		});
		await expect(ensureInstanceOrganizations(tx, ownerId)).rejects.toThrow(
			"unavailable",
		);
		expect(rows.organization_members).toHaveLength(0);
	});
});
