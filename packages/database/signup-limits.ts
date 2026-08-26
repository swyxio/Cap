import { serverEnv } from "@cap/env";
import { eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
	getPublicSignupLimit,
	isInstanceWhitelisted,
} from "./instance-policy.ts";
import { instanceSignupGuard, users } from "./schema.ts";

type SignupTransaction = Parameters<
	Parameters<MySql2Database["transaction"]>[0]
>[0];

export class PublicSignupFullError extends Error {
	constructor() {
		super("Public signup is full. Ask swyx to whitelist your account.");
		this.name = "PublicSignupFullError";
	}
}

export async function lockInstanceSignups(tx: SignupTransaction) {
	if (getPublicSignupLimit() <= 0) return;
	await tx
		.insert(instanceSignupGuard)
		.values({ id: "public-signups" })
		.onDuplicateKeyUpdate({ set: { id: "public-signups" } });
}

export async function assertNewUserAllowed(
	tx: SignupTransaction,
	email: string,
) {
	if (isInstanceWhitelisted(email)) return;
	const limit = getPublicSignupLimit();
	if (limit <= 0) {
		if (serverEnv().CAP_ALLOWED_SIGNUP_DOMAINS?.trim()) {
			throw new Error("This account is not approved for signup.");
		}
		return;
	}
	const accounts = await tx
		.select({ email: users.email })
		.from(users)
		.for("update");
	if (
		accounts.filter((account) => !isInstanceWhitelisted(account.email))
			.length >= limit
	) {
		throw new PublicSignupFullError();
	}
}

export async function getSignupDenial(
	database: MySql2Database,
	email: string,
): Promise<"AccessDenied" | "PublicSignupFull" | null> {
	const normalizedEmail = email.trim().toLowerCase();
	if (isInstanceWhitelisted(normalizedEmail)) return null;
	const [existing] = await database
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, normalizedEmail))
		.limit(1);
	if (existing) return null;
	const limit = getPublicSignupLimit();
	if (limit <= 0) {
		return serverEnv().CAP_ALLOWED_SIGNUP_DOMAINS?.trim()
			? "AccessDenied"
			: null;
	}
	const accounts = await database.select({ email: users.email }).from(users);
	return accounts.filter((account) => !isInstanceWhitelisted(account.email))
		.length >= limit
		? "PublicSignupFull"
		: null;
}
