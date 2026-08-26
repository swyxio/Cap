import { serverEnv } from "@cap/env";
import { isEmailAllowedForSignup } from "./auth/domain-utils.ts";

export function isInstanceWhitelisted(email: string): boolean {
	const whitelist = serverEnv().CAP_ALLOWED_SIGNUP_DOMAINS;
	return (
		Boolean(whitelist?.trim()) && isEmailAllowedForSignup(email, whitelist)
	);
}

export function getPublicSignupLimit(): number {
	return serverEnv().CAP_PUBLIC_SIGNUP_LIMIT ?? 0;
}

export function getPublicVideoLimit(): number {
	return serverEnv().CAP_PUBLIC_VIDEO_LIMIT ?? 0;
}
