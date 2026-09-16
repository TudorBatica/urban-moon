#!/usr/bin/env bash
# Deploy the PDF worker to Cloud Run: check, build the image, push it, deploy a new revision with
# every setting from infra/deploy/worker.env, smoke test, and check the Scheduler job that calls it.
# The same script does the first deploy and every later one. Docs: docs/deployment.md.
#
#   npm run deploy:worker                    deploy; the new revision takes all traffic
#   npm run deploy:worker -- --skip-checks   skip npm run check / npm test
#   npm run deploy:worker -- --allow-dirty   deploy uncommitted changes (the version ends in -dirty)
#   npm run deploy:worker -- --dry-run       print what would run; build, push and deploy nothing
#
#   DEPLOY_ENV=infra/deploy/worker.staging.env npm run deploy:worker     another settings file
#
# There is no --candidate: max-instances applies per revision, so a second revision taking /run
# calls could build the same submissions as the live one at the same time.
set -euo pipefail

cd "$(dirname "$0")/.."

SKIP_CHECKS=false ALLOW_DIRTY=false DRY=false
for arg in "$@"; do
	case "$arg" in
		--skip-checks) SKIP_CHECKS=true ;;
		--allow-dirty) ALLOW_DIRTY=true ;;
		--dry-run) DRY=true ;;
		*) echo "unknown option: $arg" >&2; exit 1 ;;
	esac
done

DEPLOY_ENV=${DEPLOY_ENV:-infra/deploy/worker.env}
[[ -f "$DEPLOY_ENV" ]] || { echo "settings file not found: $DEPLOY_ENV" >&2; exit 1; }
set -a
# shellcheck source=/dev/null
source "$DEPLOY_ENV"
set +a
for key in PROJECT_ID REGION SERVICE REPO BUCKET SERVICE_ACCOUNT SCHEDULER_JOB PDF_CONCURRENCY RUN_BUDGET_SECONDS CPU MEMORY NODE_HEAP_MB TIMEOUT; do
	[[ -n "${!key:-}" ]] || { echo "$key is not set in $DEPLOY_ENV" >&2; exit 1; }
done
if [[ -n "${HUBSPOT_SECRET:-}" ]]; then
	for key in HUBSPOT_PORTAL_ID HUBSPOT_FORM_ID HUBSPOT_FOLDER_PATH; do
		[[ -n "${!key:-}" ]] || { echo "$key is not set in $DEPLOY_ENV (needed with HUBSPOT_SECRET)" >&2; exit 1; }
	done
fi
if (( RUN_BUDGET_SECONDS >= TIMEOUT )); then
	echo "RUN_BUDGET_SECONDS ($RUN_BUDGET_SECONDS) must be below TIMEOUT ($TIMEOUT), or a run is cut off mid-build" >&2
	exit 1
fi

step() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
# build, push and gcloud writes go through x, so --dry-run prints them instead
x() {
	if $DRY; then printf '  +'; printf ' %q' "$@"; echo; else "$@"; fi
}
# --region is not a global flag: it goes after the subcommand (gcloud run deploy … --region=…)
where=(--project="$PROJECT_ID" --region="$REGION")
json_field() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const f=new Function("s","return ("+process.argv[1]+")");console.log(f(JSON.parse(s))??"")})' "$1"; }

# ---------------------------------------------------------------- preflight
step "Preflight"
command -v gcloud >/dev/null || fail "gcloud is not installed"
command -v docker >/dev/null || fail "docker is not installed"
if ! $DRY; then
	docker info >/dev/null 2>&1 || fail "Docker is not running"
	gcloud auth print-access-token >/dev/null 2>&1 || fail "not logged in to gcloud: gcloud auth login"
fi
if [[ -n "$(git status --porcelain)" ]] && ! $ALLOW_DIRTY; then
	fail "uncommitted changes: commit them, or pass --allow-dirty"
fi

VERSION=$(git describe --always --dirty)
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$SERVICE:$VERSION"

SERVICE_JSON=""
$DRY || SERVICE_JSON=$(gcloud run services describe "$SERVICE" "${where[@]}" --format=json 2>/dev/null || true)
EXISTING_URL=""
PREVIOUS_REVISION=""
if [[ -n "$SERVICE_JSON" ]]; then
	EXISTING_URL=$(json_field 's.status.url' <<<"$SERVICE_JSON")
	PREVIOUS_REVISION=$(json_field '(s.status.traffic||[]).filter(t=>t.percent>0).map(t=>t.revisionName).join(",")' <<<"$SERVICE_JSON")
fi

echo "  settings  $DEPLOY_ENV"
echo "  project   $PROJECT_ID ($REGION)"
echo "  service   $SERVICE${EXISTING_URL:+ — $EXISTING_URL}${SERVICE_JSON:- (new)}"
echo "  version   $VERSION"
echo "  image     $IMAGE"
if [[ -n "$PREVIOUS_REVISION" ]]; then echo "  serving   $PREVIOUS_REVISION"; fi
if $DRY; then echo "  dry run   nothing is built, pushed or deployed"; fi

# ---------------------------------------------------------------- checks
if $SKIP_CHECKS; then
	step "Check and test — skipped"
else
	step "Check and test"
	x npm run check
	x npm test
fi

# ---------------------------------------------------------------- image
step "Build the image"
x docker build --platform=linux/amd64 -f apps/input-pdf-worker/Dockerfile -t "$IMAGE" .

step "Push the image"
x docker push "$IMAGE"

# ---------------------------------------------------------------- deploy
# --set-env-vars replaces the whole set, so the service always matches the settings file.
# "^|^" makes | the separator, so values may contain commas and "=".
env_vars="GCS_BUCKET=$BUCKET|APP_VERSION=$VERSION|PDF_CONCURRENCY=$PDF_CONCURRENCY|RUN_BUDGET_SECONDS=$RUN_BUDGET_SECONDS|NODE_OPTIONS=--max-old-space-size=$NODE_HEAP_MB"

# The HubSpot token is a secret, mounted as HUBSPOT_TOKEN from Secret Manager (§5.9). Without
# HUBSPOT_SECRET the worker has no token, builds PDFs and records that nothing was delivered.
secrets_args=()
if [[ -n "${HUBSPOT_SECRET:-}" ]]; then
	env_vars="$env_vars|HUBSPOT_PORTAL_ID=$HUBSPOT_PORTAL_ID|HUBSPOT_FORM_ID=$HUBSPOT_FORM_ID|HUBSPOT_FOLDER_PATH=$HUBSPOT_FOLDER_PATH"
	secrets_args=(--set-secrets="HUBSPOT_TOKEN=$HUBSPOT_SECRET:latest")
else
	secrets_args=(--clear-secrets)
fi

# Private (only the Scheduler's invoker may call it), one instance, one request at a time: a call
# that arrives while a run is in progress is refused instead of starting a second run. Request-based
# billing (the default): nothing is billed between runs.
args=(
	--image="$IMAGE"
	--service-account="$SERVICE_ACCOUNT"
	--no-allow-unauthenticated
	--cpu="$CPU" --memory="$MEMORY"
	--concurrency=1 --min-instances=0 --max-instances=1
	--timeout="$TIMEOUT" --cpu-boost
	--set-env-vars="^|^$env_vars"
	"${secrets_args[@]}"
	--quiet
)

step "Deploy a new revision"
x gcloud run deploy "$SERVICE" "${where[@]}" "${args[@]}"

if $DRY; then
	step "Dry run done"
	exit 0
fi

SERVICE_JSON=$(gcloud run services describe "$SERVICE" "${where[@]}" --format=json)
URL=$(json_field 's.status.url' <<<"$SERVICE_JSON")
REVISION=$(json_field 's.status.latestCreatedRevisionName' <<<"$SERVICE_JSON")

# ---------------------------------------------------------------- smoke test
# The service is private: call it with your own identity token (project owners may invoke it).
step "Smoke test $URL/health"
TOKEN=$(gcloud auth print-identity-token 2>/dev/null) || fail "could not get an identity token: gcloud auth login"
healthy=false
for _ in 1 2 3 4 5 6 7 8 9 10; do
	if curl -fsS --max-time 10 -H "Authorization: Bearer $TOKEN" "$URL/health" >/dev/null 2>&1; then healthy=true; break; fi
	sleep 3
done
if ! $healthy; then
	echo "  logs:  gcloud run services logs read $SERVICE --project=$PROJECT_ID --region=$REGION --limit=50" >&2
	if [[ -n "$PREVIOUS_REVISION" && "$PREVIOUS_REVISION" != *,* ]]; then
		echo "  roll back:  gcloud run services update-traffic $SERVICE --project=$PROJECT_ID --region=$REGION --to-revisions=$PREVIOUS_REVISION=100" >&2
	fi
	fail "$URL/health did not answer"
fi
echo "  ok"

# ---------------------------------------------------------------- scheduler
step "Scheduler job $SCHEDULER_JOB"
JOB_JSON=$(gcloud scheduler jobs describe "$SCHEDULER_JOB" --project="$PROJECT_ID" --location="$REGION" --format=json 2>/dev/null || true)
if [[ -z "$JOB_JSON" ]]; then
	echo "  not found: nothing is processed until it exists (docs/deploy-worker-gcp.md, 'Scheduler job')"
else
	JOB_STATE=$(json_field 's.state' <<<"$JOB_JSON")
	JOB_URI=$(json_field '(s.httpTarget||{}).uri' <<<"$JOB_JSON")
	case "$JOB_STATE" in
		ENABLED) echo "  enabled, calls $JOB_URI every minute" ;;
		PAUSED) echo "  PAUSED: nothing is processed. Resume: gcloud scheduler jobs resume $SCHEDULER_JOB --project=$PROJECT_ID --location=$REGION" ;;
		*) echo "  state: $JOB_STATE" ;;
	esac
	if [[ "$JOB_URI" != "$URL/run" ]]; then
		echo "  WARNING: the job calls $JOB_URI, not $URL/run (docs/deploy-worker-gcp.md, 'Scheduler job')"
	fi
fi

# ---------------------------------------------------------------- summary
step "Deployed $VERSION"
echo "  revision  $REVISION"
echo "  url       $URL   (private)"
if [[ -n "$PREVIOUS_REVISION" ]]; then echo "  previous  $PREVIOUS_REVISION"; fi
