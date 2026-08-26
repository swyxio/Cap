import { createHash } from "node:crypto";
import { serverEnv } from "@cap/env";
import { ImageUpload, Organisation, type User } from "@cap/web-domain";
import { and, eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
	type OrganisationMemberRole,
	organizationMembers,
	organizations,
	users,
} from "./schema.ts";

type OrganizationExecutor = Pick<
	MySql2Database,
	"select" | "insert" | "update"
>;

export const INSTANCE_ORGANIZATION_OWNER_EMAIL = "shawnthe1@gmail.com";
export const INSTANCE_ORGANIZATION_ADMIN_EMAIL = "swyx@cognition.ai";

export const INSTANCE_ORGANIZATIONS = [
	{
		id: Organisation.OrganisationId.make("swyx-aie"),
		name: "AIE",
		domain: "ai.engineer",
		logoPath: "/instance-logos/aie.svg",
	},
	{
		id: Organisation.OrganisationId.make("swyx-latent"),
		name: "Latent Space",
		domain: "latent.space",
		logoPath: "/instance-logos/latent-space.png",
	},
	{
		id: Organisation.OrganisationId.make("swyx-smol"),
		name: "Smol",
		domain: "smol.ai",
		logoPath: "/instance-logos/smol.svg",
	},
] as const;

function membershipId(organizationId: string, userId: string) {
	return `im${createHash("sha256")
		.update(`${organizationId}:${userId}`)
		.digest("hex")
		.slice(0, 13)}`;
}

async function ensureMembership(
	tx: OrganizationExecutor,
	organizationId: Organisation.OrganisationId,
	userId: User.UserId,
	role: OrganisationMemberRole,
) {
	const [existing] = await tx
		.select({ id: organizationMembers.id, role: organizationMembers.role })
		.from(organizationMembers)
		.where(
			and(
				eq(organizationMembers.organizationId, organizationId),
				eq(organizationMembers.userId, userId),
			),
		)
		.limit(1);

	if (existing) {
		if (
			(role === "owner" && existing.role !== "owner") ||
			(role === "admin" && existing.role === "member")
		) {
			await tx
				.update(organizationMembers)
				.set({ role })
				.where(eq(organizationMembers.id, existing.id));
		}
		return;
	}

	await tx
		.insert(organizationMembers)
		.values({
			id: membershipId(organizationId, userId),
			organizationId,
			userId,
			role,
		})
		.onDuplicateKeyUpdate({ set: { id: sql`${organizationMembers.id}` } });
}

export async function ensureInstanceOrganizations(
	tx: OrganizationExecutor,
	ownerUserId: User.UserId,
) {
	if (!serverEnv().CAP_DOMAIN_ORGANIZATIONS_ENABLED) return;

	const [owner] = await tx
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, ownerUserId))
		.limit(1);
	if (owner?.email.toLowerCase() !== INSTANCE_ORGANIZATION_OWNER_EMAIL) {
		throw new Error(
			"The canonical instance owner must exist before provisioning organizations",
		);
	}

	for (const organization of INSTANCE_ORGANIZATIONS) {
		await tx
			.insert(organizations)
			.values({
				id: organization.id,
				name: organization.name,
				ownerId: ownerUserId,
				iconUrl: ImageUpload.ImageUrl.make(
					new URL(organization.logoPath, serverEnv().WEB_URL).href,
				),
			})
			.onDuplicateKeyUpdate({ set: { id: sql`${organizations.id}` } });

		const [existing] = await tx
			.select({
				ownerId: organizations.ownerId,
				tombstoneAt: organizations.tombstoneAt,
			})
			.from(organizations)
			.where(eq(organizations.id, organization.id))
			.limit(1);
		if (!existing || existing.ownerId !== ownerUserId || existing.tombstoneAt) {
			throw new Error(
				`Instance organization ${organization.id} is unavailable or has another owner`,
			);
		}
		await ensureMembership(tx, organization.id, ownerUserId, "owner");
	}
}

export async function joinInstanceOrganizations(
	tx: OrganizationExecutor,
	user: { id: User.UserId; email: string },
	options: { setDefaultOrganization?: boolean } = {},
): Promise<Organisation.OrganisationId | null> {
	if (!serverEnv().CAP_DOMAIN_ORGANIZATIONS_ENABLED) return null;

	const email = user.email.trim().toLowerCase();
	const isOperator =
		email === INSTANCE_ORGANIZATION_OWNER_EMAIL ||
		email === INSTANCE_ORGANIZATION_ADMIN_EMAIL;
	const emailParts = email.split("@");
	const matchingOrganizations = INSTANCE_ORGANIZATIONS.filter(
		(organization) =>
			isOperator ||
			(emailParts.length === 2 &&
				emailParts[0] !== "" &&
				emailParts[1] === organization.domain),
	);
	const defaultOrganization = matchingOrganizations[0];
	if (!defaultOrganization) return null;

	const [owner] = await tx
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, INSTANCE_ORGANIZATION_OWNER_EMAIL))
		.limit(1);
	if (!owner) {
		throw new Error(
			"The canonical instance owner must exist before joining organizations",
		);
	}
	await ensureInstanceOrganizations(tx, owner.id);

	for (const organization of matchingOrganizations) {
		await ensureMembership(
			tx,
			organization.id,
			user.id,
			user.id === owner.id ? "owner" : isOperator ? "admin" : "member",
		);
	}

	if (options.setDefaultOrganization) {
		await tx
			.update(users)
			.set({
				activeOrganizationId: defaultOrganization.id,
				defaultOrgId: defaultOrganization.id,
			})
			.where(eq(users.id, user.id));
	}

	return defaultOrganization.id;
}
