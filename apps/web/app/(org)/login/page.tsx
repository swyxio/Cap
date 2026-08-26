import { getCurrentUser } from "@cap/database/auth/session";
import { serverEnv } from "@cap/env";
import { redirect } from "next/navigation";
import { getSafeNextPath } from "../safe-next";
import { SwyxAuthLayout, swyxAuthMetadata } from "../swyx-auth-layout";
import { LoginForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = swyxAuthMetadata;

export default async function LoginPage(props: {
	searchParams: Promise<{ next?: string | string[] }>;
}) {
	const [searchParams, session] = await Promise.all([
		props.searchParams,
		getCurrentUser(),
	]);

	if (session) {
		redirect(getSafeNextPath(searchParams.next, serverEnv().WEB_URL));
	}

	return (
		<SwyxAuthLayout>
			<LoginForm />
		</SwyxAuthLayout>
	);
}
