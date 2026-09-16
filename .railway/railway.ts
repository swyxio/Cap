import {
	bucket,
	defineRailway,
	mysql,
	postgres,
	preserve,
	project,
	service,
	volume,
} from "railway/iac";

export default defineRailway(() => {
	const MySQL = mysql("MySQL", { region: "us-west2" });
	MySQL.deploy = {
		limitOverride: { containers: { cpu: 1, memoryBytes: 1000000000 } },
		startCommand:
			"docker-entrypoint.sh mysqld --innodb-use-native-aio=0 --disable-log-bin --performance_schema=0 --innodb-buffer-pool-size=1G",
	};
	MySQL.networking = { privateNetworkEndpoint: "mysql" };
	const Postgres = postgres("Postgres", { region: "us-west2" });
	Postgres.deploy = {
		limitOverride: { containers: { cpu: 1, memoryBytes: 1000000000 } },
	};
	Postgres.networking = { privateNetworkEndpoint: "postgres" };
	const postgresVolume = volume("postgres-volume", {
		alerts: { usage: { "100": {}, "80": {}, "95": {} } },
		allowOnlineResize: true,
		region: "us-west2",
		sizeMB: 50000,
	});
	const mysqlVolume = volume("mysql-volume", {
		alerts: { usage: { "100": {}, "80": {}, "95": {} } },
		allowOnlineResize: true,
		region: "us-west2",
		sizeMB: 50000,
	});
	const recordings = bucket("recordings", { region: "sjc" });
	const capMedia = service("cap-media", {
		build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile.standalone" },
		start: "bun run src/index.ts",
		healthcheck: "/health",
		healthcheckTimeout: 30,
		replicas: { "us-west2": 1 },
		deploy: {
			limitOverride: { containers: { cpu: 2, memoryBytes: 2000000000 } },
			restartPolicyType: "ALWAYS",
			restartPolicyMaxRetries: 50,
		},
		env: {
			MEDIA_SERVER_MAX_CONCURRENT_VIDEO_PROCESSES: preserve(),
			MEDIA_SERVER_WEBHOOK_SECRET: preserve(),
			PORT: preserve(),
			RAILWAY_DOCKERFILE_PATH: preserve(),
		},
	});
	const capWeb = service("cap-web", {
		build: {
			builder: "DOCKERFILE",
			dockerfilePath: "infra/railway/Dockerfile.web",
		},
		healthcheck: "/login",
		healthcheckTimeout: 180,
		replicas: { "us-west2": 1 },
		deploy: {
			limitOverride: { containers: { cpu: 2, memoryBytes: 2000000000 } },
			restartPolicyType: "ON_FAILURE",
			restartPolicyMaxRetries: 3,
		},
		domains: ["cap.swyx.io"],
		env: {
			CAP_ALLOWED_SIGNUP_DOMAINS: preserve(),
			CAP_AWS_ACCESS_KEY: preserve(),
			CAP_AWS_BUCKET: preserve(),
			CAP_AWS_REGION: preserve(),
			CAP_AWS_SECRET_KEY: preserve(),
			CAP_DOMAIN_ORGANIZATIONS_ENABLED: preserve(),
			CAP_PUBLIC_SIGNUP_LIMIT: preserve(),
			CAP_PUBLIC_VIDEO_LIMIT: preserve(),
			CAP_VIDEOS_DEFAULT_PUBLIC: preserve(),
			DATABASE_ENCRYPTION_KEY: preserve(),
			DATABASE_URL: preserve(),
			GOOGLE_CLIENT_ID: preserve(),
			GOOGLE_CLIENT_SECRET: preserve(),
			MEDIA_SERVER_URL: preserve(),
			MEDIA_SERVER_WEBHOOK_SECRET: preserve(),
			MEDIA_SERVER_WEBHOOK_URL: preserve(),
			NEXTAUTH_SECRET: preserve(),
			NEXTAUTH_URL: preserve(),
			NEXT_PUBLIC_DOCKER_BUILD: preserve(),
			NEXT_PUBLIC_WEB_URL: preserve(),
			PORT: preserve(),
			RAILWAY_DOCKERFILE_PATH: preserve(),
			RESEND_API_KEY: preserve(),
			RESEND_FROM_DOMAIN: preserve(),
			S3_INTERNAL_ENDPOINT: preserve(),
			S3_PATH_STYLE: preserve(),
			S3_PUBLIC_ENDPOINT: preserve(),
			WEB_URL: preserve(),
			WORKFLOW_LOCAL_BASE_URL: preserve(),
			WORKFLOW_POSTGRES_MAX_POOL_SIZE: preserve(),
			WORKFLOW_POSTGRES_URL: preserve(),
			WORKFLOW_POSTGRES_WORKER_CONCURRENCY: preserve(),
			WORKFLOW_TARGET_WORLD: preserve(),
		},
	});

	return project("cap", {
		resources: [
			MySQL,
			capMedia,
			capWeb,
			Postgres,
			postgresVolume,
			mysqlVolume,
			recordings,
		],
	});
});
