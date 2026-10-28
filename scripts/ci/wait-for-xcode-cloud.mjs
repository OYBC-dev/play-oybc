#!/usr/bin/env node
/**
 * Waits for an Xcode Cloud workflow's check runs on a commit and relays their
 * verdict as this process's exit status (#688, 2026-10-27).
 *
 * Why this exists: `ios-ok` is the one REQUIRED iOS status check on `dev`, and
 * it is a GitHub Actions aggregator job. When the iOS tests run on Xcode Cloud
 * instead of GitHub's metered macOS runners, Xcode Cloud reports its own check
 * runs (GitHub App `xcode-cloud`, one per action, named
 * `<Product> | <Workflow> | <Action> - iOS`). Requiring those directly would
 * block every PR whose files don't match the Xcode Cloud workflow's start
 * condition (a required check that never reports never passes), so the
 * aggregator stays required and this script bridges the two: it polls the PR
 * head commit's check runs, waits for every run of the named workflow to
 * complete, and fails if any of them did not succeed — or if none appeared
 * within the grace period (start condition / files filter mismatch, workflow
 * disabled, repo disconnected).
 *
 * Usage:
 *   node scripts/ci/wait-for-xcode-cloud.mjs --sha <commit> --workflow "PR Tests"
 *     [--appear-minutes 10] [--timeout-minutes 55] [--poll-seconds 60] [--once]
 *
 * Environment: GITHUB_TOKEN (checks: read) and GITHUB_REPOSITORY (owner/repo).
 * `--once` evaluates the current state and exits without waiting (exit 0 when
 * every matched run has succeeded, 2 while runs are pending or absent, 1 on a
 * failed run) — used to smoke-test the matcher against a real commit.
 *
 * No dependencies: Node 20+ global fetch only.
 */

const APP_SLUG = "xcode-cloud";
const OK_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);

/**
 * Parses `--key value` / `--flag` arguments into an object.
 * @param {string[]} argv
 * @returns {Record<string, string | boolean>}
 */
function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

/**
 * Fetches every check run on a commit (the API returns the latest run per
 * name by default, so a re-run replaces, never duplicates).
 * @param {string} repo owner/repo
 * @param {string} sha
 * @param {string} token
 * @returns {Promise<Array<{name: string, status: string, conclusion: string | null, details_url: string | null, app: {slug: string} | null}>>}
 */
async function fetchCheckRuns(repo, sha, token) {
  const runs = [];
  for (let page = 1; page <= 5; page += 1) {
    const url = `https://api.github.com/repos/${repo}/commits/${sha}/check-runs?per_page=100&page=${page}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) {
      throw new Error(`GET ${url} → HTTP ${res.status}: ${await res.text()}`);
    }
    const body = await res.json();
    runs.push(...body.check_runs);
    if (runs.length >= body.total_count) break;
  }
  return runs;
}

/**
 * Picks the Xcode Cloud check runs that belong to the named workflow.
 * @param {Array<{name: string, app: {slug: string} | null}>} runs
 * @param {string} workflow
 */
function matchRuns(runs, workflow) {
  const needle = `| ${workflow} |`.toLowerCase();
  return runs.filter(
    (run) => run.app?.slug === APP_SLUG && run.name.toLowerCase().includes(needle),
  );
}

/**
 * Classifies the matched runs.
 * @param {Array<{name: string, status: string, conclusion: string | null}>} matched
 * @returns {"absent" | "pending" | "success" | "failure"}
 */
function verdict(matched) {
  if (matched.length === 0) return "absent";
  if (matched.some((run) => run.status !== "completed")) return "pending";
  return matched.every((run) => OK_CONCLUSIONS.has(run.conclusion ?? "")) ? "success" : "failure";
}

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sha = typeof args.sha === "string" ? args.sha : "";
  const workflow = typeof args.workflow === "string" ? args.workflow : "";
  const appearMinutes = Number(args["appear-minutes"] ?? 10);
  const timeoutMinutes = Number(args["timeout-minutes"] ?? 55);
  const pollSeconds = Number(args["poll-seconds"] ?? 60);
  const once = args.once === true;
  const token = process.env.GITHUB_TOKEN ?? "";
  const repo = process.env.GITHUB_REPOSITORY ?? "";

  if (!sha || !workflow || !token || !repo) {
    console.error(
      "usage: --sha <commit> --workflow <name>; needs GITHUB_TOKEN and GITHUB_REPOSITORY",
    );
    return 1;
  }

  const started = Date.now();
  for (;;) {
    const elapsedMin = (Date.now() - started) / 60_000;
    const matched = matchRuns(await fetchCheckRuns(repo, sha, token), workflow);
    const state = verdict(matched);
    const summary = matched
      .map((run) => `${run.name}: ${run.status}${run.conclusion ? `/${run.conclusion}` : ""}`)
      .join("; ");
    console.log(
      `[${elapsedMin.toFixed(1)} min] ${state}${summary ? ` — ${summary}` : ""}`,
    );

    if (state === "success") {
      console.log(`::notice::Xcode Cloud "${workflow}" passed on ${sha}`);
      return 0;
    }
    if (state === "failure") {
      for (const run of matched) {
        if (!OK_CONCLUSIONS.has(run.conclusion ?? "")) {
          console.log(`::error::${run.name}: ${run.conclusion} — ${run.details_url ?? ""}`);
        }
      }
      return 1;
    }
    if (once) return 2;
    if (state === "absent" && elapsedMin >= appearMinutes) {
      console.log(
        `::error::No Xcode Cloud "${workflow}" check run appeared on ${sha} within ${appearMinutes} min. ` +
          "Check the workflow's start condition (pull request → dev) and its Files and Folders filter (apps/ios/), " +
          "or set the repo variable IOS_CI_BACKEND=github to fall back to the hosted runners.",
      );
      return 1;
    }
    if (elapsedMin >= timeoutMinutes) {
      console.log(
        `::error::Xcode Cloud "${workflow}" still ${state} on ${sha} after ${timeoutMinutes} min.`,
      );
      return 1;
    }
    await sleep(pollSeconds * 1000);
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.log(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
