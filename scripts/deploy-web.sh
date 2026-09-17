#!/usr/bin/env bash
# Deploy the web app to Cloud Run: check, build the image, push it, deploy a new revision with every
# setting from infra/deploy/web.env, smoke test. The same script does the first deploy and every
# later one.
#
#   npm run deploy:web                      deploy; the new revision takes all traffic
#   npm run deploy:web -- --candidate       deploy without traffic, reachable on the "candidate" tag URL
#   npm run deploy:web -- --skip-checks     skip npm run check / npm test
#   npm run deploy:web -- --allow-dirty     deploy uncommitted changes (the version ends in -dirty)
#   npm run deploy:web -- --dry-run         print what would run; build, push and deploy nothing
#
#   DEPLOY_ENV=infra/deploy/web.staging.env npm run deploy:web     another settings file
set -euo pipefail

cd "$(dirname "$0")/.."

CANDIDATE=false SKIP_CHECKS=false ALLOW_DIRTY=false DRY=false
for arg in "$@"; do
	case "$arg" in
		--candidate) CANDIDATE=true ;;
		--skip-checks) SKIP_CHECKS=true ;;
		--allow-dirty) ALLOW_DIRTY=true ;;
		--dry-run) DRY=true ;;
		*) echo "unknown option: $arg" >&2; exit 1 ;;
	esac
done

DEPLOY_ENV=${DEPLOY_ENV:-infra/deploy/web.env}
[[ -f "$DEPLOY_ENV" ]] || { echo "settings file not found: $DEPLOY_ENV" >&2; exit 1; }
set -a
# shellcheck source=/dev/null
source "$DEPLOY_ENV"
set +a
for key in PROJECT_ID REGION SERVICE REPO BUCKET SERVICE_ACCOUNT BODY_SIZE_LIMIT CPU MEMORY CONCURRENCY MIN_INSTANCES MAX_INSTANCES TIMEOUT; do
	[[ -n "${!key:-}" ]] || { echo "$key is not set in $DEPLOY_ENV" >&2; exit 1; }
done

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
if $CANDIDATE && [[ -z "$SERVICE_JSON" ]] && ! $DRY; then
	fail "--candidate needs an existing service; the first deploy takes traffic"
fi
ORIGIN_VALUE=${WEB_ORIGIN:-$EXISTING_URL}

echo "  settings  $DEPLOY_ENV"
echo "  project   $PROJECT_ID ($REGION)"
echo "  service   $SERVICE${EXISTING_URL:+ — $EXISTING_URL}${SERVICE_JSON:- (new)}"
echo "  version   $VERSION"
echo "  image     $IMAGE"
if [[ -n "$PREVIOUS_REVISION" ]]; then echo "  serving   $PREVIOUS_REVISION"; fi
if $CANDIDATE; then echo "  mode      candidate (no traffic)"; fi
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
x docker build --platform=linux/amd64 -f apps/input-capture-web/Dockerfile -t "$IMAGE" .

step "Push the image"
x docker push "$IMAGE"

# ---------------------------------------------------------------- deploy
# --set-env-vars replaces the whole set, so the service always matches the settings file.
# "^|^" makes | the separator, so values may contain commas.
env_vars="GCS_BUCKET=$BUCKET|APP_VERSION=$VERSION|BODY_SIZE_LIMIT=$BODY_SIZE_LIMIT|PUBLIC_CALENDLY_URL=${PUBLIC_CALENDLY_URL:-}"
[[ -n "$ORIGIN_VALUE" ]] && env_vars+="|ORIGIN=$ORIGIN_VALUE"

args=(
	--image="$IMAGE"
	--service-account="$SERVICE_ACCOUNT"
	--allow-unauthenticated
	--cpu="$CPU" --memory="$MEMORY" --concurrency="$CONCURRENCY"
	--min-instances="$MIN_INSTANCES" --max-instances="$MAX_INSTANCES"
	--timeout="$TIMEOUT" --cpu-boost
	--set-env-vars="^|^$env_vars"
	--quiet
)
$CANDIDATE && args+=(--no-traffic --tag=candidate)

step "Deploy a new revision"
x gcloud run deploy "$SERVICE" "${where[@]}" "${args[@]}"

if $DRY; then
	if [[ -z "$ORIGIN_VALUE" ]]; then echo "  (a first deploy then sets ORIGIN to the new service URL)"; fi
	step "Dry run done"
	exit 0
fi

SERVICE_JSON=$(gcloud run services describe "$SERVICE" "${where[@]}" --format=json)
URL=$(json_field 's.status.url' <<<"$SERVICE_JSON")
REVISION=$(json_field 's.status.latestCreatedRevisionName' <<<"$SERVICE_JSON")

# The first deploy cannot know its own URL beforehand.
if [[ -z "$ORIGIN_VALUE" ]]; then
	step "Set ORIGIN to $URL (first deploy)"
	x gcloud run services update "$SERVICE" "${where[@]}" --update-env-vars="ORIGIN=$URL" --quiet
	SERVICE_JSON=$(gcloud run services describe "$SERVICE" "${where[@]}" --format=json)
	REVISION=$(json_field 's.status.latestCreatedRevisionName' <<<"$SERVICE_JSON")
fi

TEST_URL=$URL
if $CANDIDATE; then
	TEST_URL=$(json_field '((s.status.traffic||[]).find(t=>t.tag==="candidate")||{}).url' <<<"$SERVICE_JSON")
fi

# ---------------------------------------------------------------- smoke test
step "Smoke test $TEST_URL/api/health"
healthy=false
for _ in 1 2 3 4 5 6 7 8 9 10; do
	if curl -fsS --max-time 10 "$TEST_URL/api/health" >/dev/null 2>&1; then healthy=true; break; fi
	sleep 3
done
if ! $healthy; then
	echo "  logs:  gcloud run services logs read $SERVICE --project=$PROJECT_ID --region=$REGION --limit=50" >&2
	if ! $CANDIDATE && [[ -n "$PREVIOUS_REVISION" && "$PREVIOUS_REVISION" != *,* ]]; then
		echo "  roll back:  gcloud run services update-traffic $SERVICE --project=$PROJECT_ID --region=$REGION --to-revisions=$PREVIOUS_REVISION=100" >&2
	fi
	fail "$TEST_URL/api/health did not answer"
fi
echo "  ok"

# ---------------------------------------------------------------- summary
step "Deployed $VERSION"
echo "  revision  $REVISION"
if $CANDIDATE; then
	echo "  test at   $TEST_URL   (no traffic)"
	echo "  promote   gcloud run services update-traffic $SERVICE --project=$PROJECT_ID --region=$REGION --to-latest"
else
	echo "  live at   $URL"
	if [[ -n "$PREVIOUS_REVISION" ]]; then echo "  previous  $PREVIOUS_REVISION"; fi
fi
