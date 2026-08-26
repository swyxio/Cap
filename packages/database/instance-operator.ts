export const INSTANCE_ORGANIZATION_OWNER_EMAIL = "shawnthe1@gmail.com";
export const INSTANCE_ORGANIZATION_ADMIN_EMAIL = "swyx@cognition.ai";

export function isInstanceOperatorEmail(email: string): boolean {
	const normalized = email.trim().toLowerCase();
	return (
		normalized === INSTANCE_ORGANIZATION_OWNER_EMAIL ||
		normalized === INSTANCE_ORGANIZATION_ADMIN_EMAIL
	);
}
