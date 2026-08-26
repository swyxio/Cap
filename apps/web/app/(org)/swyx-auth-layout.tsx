import type { Metadata } from "next";
import { type PropsWithChildren, useId } from "react";

export const swyxAuthMetadata: Metadata = {
	title: "Cap for working with swyx",
	description:
		"Screen recordings for collaboration with swyx. Tested and approved by swyx. The server operator can access every recording uploaded here.",
	robots: { index: false, follow: false },
	openGraph: {
		title: "Cap for working with swyx",
		description: "Demos, walkthroughs, and async updates for work with swyx.",
		url: "https://cap.swyx.io/login",
		siteName: "swyx / Cap",
		images: [],
	},
	twitter: {
		card: "summary",
		title: "Cap for working with swyx",
		description: "Demos, walkthroughs, and async updates for work with swyx.",
		images: [],
	},
};

export function SwyxUsageNotice() {
	return (
		<p className="pt-3 text-xs leading-relaxed text-center text-gray-11">
			By signing in, you agree to use this instance only for work with swyx and
			understand that swyx can access every recording you upload here.
		</p>
	);
}

export function SwyxAuthLayout({ children }: PropsWithChildren) {
	const instanceTitleId = useId();
	const recordingAccessId = useId();
	const signInId = useId();

	return (
		<div className="min-h-screen bg-gray-2 text-gray-12">
			<header className="flex items-center justify-between gap-4 px-6 py-6 mx-auto max-w-6xl sm:px-10">
				<a
					href="https://swyx.io/tools"
					className="text-sm font-medium text-gray-11 hover:text-blue-9 focus-visible:outline-offset-4"
				>
					← swyx.io / tools
				</a>
				<a
					href={`#${signInId}`}
					className="text-sm font-medium text-blue-9 hover:underline focus-visible:outline-offset-4"
				>
					Go to sign in ↓
				</a>
			</header>
			<main className="px-6 pt-8 pb-12 mx-auto max-w-6xl sm:px-10 lg:pt-14">
				<div className="grid gap-10 items-start lg:grid-cols-[1.15fr_1fr] lg:gap-16">
					<section aria-labelledby={instanceTitleId}>
						<p className="mb-5 font-mono text-xs font-medium tracking-widest uppercase text-blue-9">
							swyx / Cap · collaboration workspace
						</p>
						<h1
							id={instanceTitleId}
							className="text-4xl font-medium tracking-tight leading-tight sm:text-5xl"
						>
							Screen recordings for working with swyx.
						</h1>
						<p className="mt-5 text-lg leading-relaxed text-gray-11">
							Show a demo, explain a bug, or send a walkthrough without another
							meeting. This is swyx’s self-hosted instance of Cap, the
							open-source alternative to Loom, for teammates and collaborators
							working with swyx.
						</p>
						<aside
							aria-labelledby={recordingAccessId}
							className="p-5 mt-7 rounded-r-xl border-l-4 border-blue-9 bg-blue-3"
						>
							<h2 id={recordingAccessId} className="text-lg font-semibold">
								swyx can access every recording uploaded here.
							</h2>
							<p className="mt-2 text-sm leading-relaxed text-gray-12">
								Use this instance only for work with swyx—not personal
								recordings or unrelated work. As the server operator, swyx can
								access recordings even when they are marked private. Private
								sharing limits other viewers; it does not hide recordings from
								swyx.
							</p>
						</aside>
						<div className="mt-6">
							<h2 className="text-sm font-semibold">
								Tested. Approved by swyx.
							</h2>
							<p className="mt-2 text-sm leading-relaxed text-gray-11">
								swyx has tested recording and approved this instance for
								collaboration. Google sign-in, uploads, processing, private
								playback, and web-service restart recovery have also been
								tested.
							</p>
						</div>
					</section>
					<section
						id={signInId}
						aria-label="Account access"
						className="min-w-0 scroll-mt-6"
					>
						{children}
						<p className="px-2 mt-4 text-sm leading-relaxed text-center text-gray-11">
							Access is limited to approved accounts. If your account isn’t
							accepted, ask swyx to arrange access.
						</p>
					</section>
				</div>
				<footer className="grid gap-8 pt-8 mt-12 border-t border-gray-5 sm:grid-cols-2">
					<div>
						<h2 className="text-base font-semibold">Connect Cap Desktop</h2>
						<p className="mt-2 text-sm leading-relaxed text-gray-11">
							In Settings → General → Self-host, set Cap Server URL to{" "}
							<code className="font-mono text-xs text-gray-12">
								https://cap.swyx.io
							</code>
							. Then sign in to this instance. Storage is already configured;
							leave the Google Drive and S3 integrations unset.
						</p>
					</div>
					<nav aria-label="Official Cap resources">
						<h2 className="text-base font-semibold">Learn about Cap</h2>
						<div className="flex flex-wrap gap-x-5 gap-y-3 mt-3 text-sm text-blue-9 [&_a]:underline [&_a]:underline-offset-4">
							<a href="https://cap.so/download">Download Cap Desktop ↗</a>
							<a href="https://cap.so/docs">Official docs ↗</a>
							<a href="https://cap.so/docs/sharing/share-a-cap">
								Sharing guide ↗
							</a>
							<a href="https://cap.so/docs/self-hosting">
								Self-hosting guide ↗
							</a>
							<a href="https://github.com/CapSoftware/Cap">
								Open-source project ↗
							</a>
						</div>
						<p className="mt-4 text-xs leading-relaxed text-gray-11">
							Operated by swyx, not Cap’s hosted service. Official docs describe
							the wider product; AI transcription is not enabled on this
							instance.
						</p>
					</nav>
				</footer>
			</main>
		</div>
	);
}
