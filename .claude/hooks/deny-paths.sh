#!/usr/bin/env bash
# PreToolUse hook: refuses file changes under the given repo-relative directories.
#   deny-paths.sh docs/architecture infra scripts
# Edit, Write, MultiEdit and NotebookEdit are checked by their target path. Bash is checked by
# pattern: a command that names a protected directory and writes, moves or deletes files is refused.
# A script that opens files by itself (node, python) is not detected.
set -euo pipefail

input=$(cat)
root=${CLAUDE_PROJECT_DIR:-$(pwd)}
tool=$(jq -r '.tool_name // ""' <<<"$input")

refuse() {
	local what=$1
	shift
	echo "Refused: $what is outside what this agent may change (protected: $*). Report the change it needs in your summary instead." >&2
	exit 2
}

case "$tool" in
	Edit | Write | MultiEdit | NotebookEdit)
		target=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' <<<"$input")
		[[ -z "$target" ]] && exit 0
		[[ "$target" != /* ]] && target="$root/$target"
		target=$(realpath -m "$target")
		for dir in "$@"; do
			if [[ "$target" == "$(realpath -m "$root/$dir")"/* ]]; then refuse "$target" "$@"; fi
		done
		;;
	Bash)
		command=$(jq -r '.tool_input.command // ""' <<<"$input")
		writes='(\btee\b|\bsed\b[^|;&]*-i|\bperl\b[^|;&]*-i|\bmv\b|\bcp\b|\brm\b|\bmkdir\b|\btouch\b|\btruncate\b|\bln\b|\bchmod\b|\bgit\b[^|;&]*\b(mv|rm|checkout|restore|apply)\b|\bpatch\b)'
		for dir in "$@"; do
			mention="(^|[[:space:]'\"=/])(\./)?${dir}(/|[[:space:]'\"]|$)"
			redirect=">[>|]?[[:space:]]*['\"]?(\./|$root/)?${dir}(/|[[:space:]'\"]|$)"
			if grep -qE "$redirect" <<<"$command"; then refuse "a redirect into $dir" "$@"; fi
			if grep -qE "$writes" <<<"$command" && grep -qE "$mention" <<<"$command"; then refuse "a command touching $dir" "$@"; fi
		done
		;;
esac
exit 0
