export type InstanceOverviewFilters = {
	q: string;
	userId: string;
	orgId: string;
	kind: "" | "recordings" | "screenshots";
};

export type InstanceUsage = {
	recordings: number;
	screenshots: number;
	durationSeconds: number | null;
	knownDurationCount: number;
};

export type InstanceUserRow = InstanceUsage & {
	id: string;
	name: string | null;
	email: string;
	createdAt: string;
	whitelisted: boolean;
	lastRecordingAt: string | null;
};

export type InstanceVideoRow = {
	id: string;
	name: string;
	ownerId: string;
	ownerName: string | null;
	ownerEmail: string | null;
	orgId: string;
	orgName: string | null;
	createdAt: string;
	isScreenshot: boolean;
	public: boolean;
	durationSeconds: number | null;
	sourceType: string | null;
	jobStatus: string | null;
	transcriptionStatus: string | null;
};

export type InstanceOverview = {
	summary: InstanceUsage & {
		users: number;
		publicUsers: number;
		trustedUsers: number;
		publicSignupLimit: number;
		publicVideoLimit: number;
	};
	userRows: InstanceUserRow[];
	orgs: { id: string; name: string }[];
	videos: InstanceVideoRow[];
	totalFiltered: number;
	page: number;
	pageSize: number;
	filters: InstanceOverviewFilters;
};
