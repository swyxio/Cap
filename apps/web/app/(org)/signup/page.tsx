import { getCurrentUser } from "@cap/database/auth/session";
import { redirect } from "next/navigation";
import { SwyxAuthLayout, swyxAuthMetadata } from "../swyx-auth-layout";
import { SignupForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = swyxAuthMetadata;

export default async function SignupPage() {
	const session = await getCurrentUser();
	if (session) {
		redirect("/dashboard");
	}
	return (
		<SwyxAuthLayout>
			<SignupForm />
		</SwyxAuthLayout>
	);
}
