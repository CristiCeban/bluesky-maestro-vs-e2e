"""Summarizes bench runs: one CSV row per run, Markdown tables per platform.

Usage: summarize.py <results dir> <jobs.json> <out.csv>  (Markdown to stdout)

Test names are normalised across the tools: Maestro names a test after its
flow file (`post.default`), e2e after its file path with the target
(`report-dialog/post.default [ios]`); both become `post.default`.
"""
import csv
import json
import re
import statistics
import sys
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

results_dir, jobs_path, csv_path = sys.argv[1:4]

# The phase 3 HANDOFF's "reliable" sets: flows Maestro passed in both baseline
# passes locally. `both` = reliable on both platforms.
RELIABLE_BOTH = {'composer-self-label', 'home-screen', 'mod-lists'}
RELIABLE = {
    'ios': {'composer-self-label', 'feed-reorder', 'following-restore', 'home-screen', 'login',
            'mod-lists', 'onboarding', 'search-screen', 'shared-prefs', 'post-report-flow',
            'post.default', 'post.edit-reason', 'post.reason-other'},
    'android': {'composer-self-label', 'home-screen', 'mod-lists', 'onboarding-avatar-creator',
                'thread-screen'},
}


def read_env(path):
    env = {}
    if path.exists():
        for line in path.read_text().splitlines():
            if '=' in line:
                k, v = line.split('=', 1)
                env[k] = v
    return env


def norm(name):
    name = re.sub(r' \[(android|ios)\]$', '', name)
    return name.rsplit('/', 1)[-1]


def parse_junit(out):
    """Returns {test: (seconds, status, message)}; skipped tests are left out."""
    tests = {}
    for xml in out.rglob('junit*.xml'):
        for case in ET.parse(xml).getroot().iter('testcase'):
            if case.find('skipped') is not None:
                continue
            fail = case.find('failure')
            if fail is None:
                fail = case.find('error')
            failed = fail is not None or case.get('status') not in (None, 'SUCCESS')
            msg = ''
            if fail is not None:
                msg = ' '.join((fail.get('message') or fail.text or '').split())[:240]
            tests[norm(case.get('name', ''))] = (float(case.get('time') or 0),
                                                'failed' if failed else 'passed', msg)
    return tests


def job_seconds(jobs, name):
    for job in jobs:
        if job['name'] == name and job.get('started_at') and job.get('completed_at'):
            a = datetime.fromisoformat(job['started_at'].replace('Z', '+00:00'))
            b = datetime.fromisoformat(job['completed_at'].replace('Z', '+00:00'))
            return round((b - a).total_seconds(), 1)
    return None


raw = Path(jobs_path).read_text()
# `gh api --paginate` concatenates pages; split them back into objects.
jobs = []
for page in re.split(r'(?<=\})\s*(?=\{)', raw.strip()):
    jobs += json.loads(page).get('jobs', [])

runs = []
for out in sorted(Path(results_dir).glob('bench-*/out')):
    env = read_env(out / 'result.env')
    if not env:
        continue
    steps = read_env(out / 'steps.txt')
    runs.append({**env, **steps, 'tests': parse_junit(out),
                 'job_s': job_seconds(jobs, f"bench {env['platform']} {env['arm']} {env['run']}")})

# Like for like, per platform: the tests every run of every arm reported.
shared = {}
for platform in {r['platform'] for r in runs}:
    names = [set(r['tests']) for r in runs if r['platform'] == platform and r['tests']]
    shared[platform] = set.intersection(*names) if names else set()


def subset_sum(t, names):
    return round(sum(t[n][0] for n in names if n in t), 1)


def subset_passed(t, names):
    return sum(1 for n in names if n in t and t[n][1] == 'passed')


rows = []
for r in runs:
    t = r['tests']
    p = r['platform']
    rows.append({
        'platform': p, 'arm': r['arm'], 'run': r['run'], 'started_at': r.get('started_at'),
        'suite_s': float(r['suite_s']), 'job_s': r['job_s'],
        'test_sum_s': round(sum(v[0] for v in t.values()), 1),
        'shared_tests': len(shared[p]),
        'shared_test_sum_s': subset_sum(t, shared[p]),
        'reliable_both_sum_s': subset_sum(t, RELIABLE_BOTH),
        'reliable_both_passed': subset_passed(t, RELIABLE_BOTH),
        'reliable_platform_sum_s': subset_sum(t, RELIABLE[p]),
        'reliable_platform_passed': subset_passed(t, RELIABLE[p]),
        'tests_total': len(t),
        'tests_passed': sum(1 for v in t.values() if v[1] == 'passed'),
        'tests_failed': sum(1 for v in t.values() if v[1] == 'failed'),
        'exit': r['exit'],
        'install_s': r.get('install_s'), 'boot_install_s': r.get('boot_install_s'),
        'backend_s': r.get('backend_s'), 'metro_prewarm_s': r.get('metro_prewarm_s'),
        'versions': r.get('versions'), 'device': r.get('device'), 'runner': r.get('runner'),
        'app_sha256': r.get('app_sha256'), 'commit': r.get('commit'),
        'warm_launch_s': r.get('warm_launch_s'), 'anr_guard': r.get('anr_guard'), 'anr_events': r.get('anr_events'),
        'failed_tests': '; '.join(sorted(n for n, v in t.items() if v[1] == 'failed')),
        'failures': ' | '.join(f"{n}: {v[2]}" for n, v in sorted(t.items()) if v[1] == 'failed'),
        'per_test_s': ';'.join(f"{n}={v[0]:.1f}{'' if v[1] == 'passed' else '!'}" for n, v in sorted(t.items())),
    })

with open(csv_path, 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0]) if rows else ['arm'])
    w.writeheader()
    w.writerows(rows)


def p90(xs):
    xs = sorted(xs)
    return xs[max(0, -(-len(xs) * 9 // 10) - 1)]


def fmt(xs):
    xs = [x for x in xs if x is not None]
    if not xs:
        return 'n/a'
    return f"{statistics.median(xs):.1f} (p90 {p90(xs):.1f}, {min(xs):.1f}–{max(xs):.1f})"


for platform in sorted({r['platform'] for r in rows}):
    prs = [r for r in rows if r['platform'] == platform]
    arms = sorted({r['arm'] for r in prs})
    print(f"## {platform}: Maestro vs e2e\n")
    print(f"Device: {prs[0]['device']}. Runner: {prs[0]['runner']}. "
          f"Shared tests (like for like): {len(shared[platform])}. "
          f"Reliable on both platforms: {len(RELIABLE_BOTH)}; reliable on {platform}: {len(RELIABLE[platform])}.\n")
    print('| Arm | N | Suite s, median (p90, min–max) | Shared-test sum s | Reliable-both (3) sum s '
          f'| Reliable-{platform} ({len(RELIABLE[platform])}) sum s | Job s | Green runs | Tests passed / run |')
    print('|---|---|---|---|---|---|---|---|---|')
    for arm in arms:
        rs = [r for r in prs if r['arm'] == arm]
        green = sum(1 for r in rs if r['tests_failed'] == 0 and r['exit'] == '0')
        passed = ', '.join(f"{r['tests_passed']}/{r['tests_total']}" for r in rs)
        print(f"| {arm} | {len(rs)} | {fmt([r['suite_s'] for r in rs])} | "
              f"{fmt([r['shared_test_sum_s'] for r in rs])} | {fmt([r['reliable_both_sum_s'] for r in rs])} | "
              f"{fmt([r['reliable_platform_sum_s'] for r in rs])} | {fmt([r['job_s'] for r in rs])} | "
              f"{green}/{len(rs)} | {passed} |")
    print()
    # Per test: passes / runs and the median time of the passing runs.
    names = sorted({n for r in runs if r['platform'] == platform for n in r['tests']})
    print('| Test | ' + ' | '.join(f'{a} passed | {a} median s (passed)' for a in arms) + ' |')
    print('|---|' + '---|---|' * len(arms))
    for n in names:
        cells = []
        for arm in arms:
            rs = [r for r in runs if r['platform'] == platform and r['arm'] == arm]
            ok = [r['tests'][n][0] for r in rs if n in r['tests'] and r['tests'][n][1] == 'passed']
            cells += [f"{len(ok)}/{len(rs)}", f"{statistics.median(ok):.1f}" if ok else 'n/a']
        tag = ' (reliable-both)' if n in RELIABLE_BOTH else (' (reliable)' if n in RELIABLE[platform] else '')
        print(f"| {n}{tag} | " + ' | '.join(cells) + ' |')
    print()

failed = [f"{r['platform']} {r['arm']} {r['run']} (exit {r['exit']}): {r['failures'] or 'no JUnit failures'}"
          for r in rows if r['failures'] or r['exit'] != '0']
if failed:
    print('Failed tests:\n')
    for line in failed:
        print(f'- {line}')
