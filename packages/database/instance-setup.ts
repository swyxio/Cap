import { serverEnv } from "@cap/env";
import { eq } from "drizzle-orm";
import { db } from "./index.ts";
import {
	ensureInstanceOrganizations,
	INSTANCE_ORGANIZATION_OWNER_EMAIL,
	joinInstanceOrganizations,
} from "./instance-organizations.ts";
import { users } from "./schema.ts";
import { lockInstanceSignups } from "./signup-limits.ts";

export async function setupInstanceOrganizations() {
	if (!serverEnv().CAP_DOMAIN_ORGANIZATIONS_ENABLED) return;
	await db().transaction(async (tx) => {
		await lockInstanceSignups(tx);
		const [owner] = await tx
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, INSTANCE_ORGANIZATION_OWNER_EMAIL))
			.limit(1)
			.for("update");
		if (!owner)
			throw new Error(
				"Create the canonical swyx account before enabling organization setup.",
			);
		await ensureInstanceOrganizations(tx, owner.id);
		const accounts = await tx
			.select({ id: users.id, email: users.email })
			.from(users)
			.for("update");
		for (const account of accounts)
			await joinInstanceOrganizations(tx, account);
	});
}
