// Decides the next version from Conventional Commits since the last release tag:
//   feat!: / BREAKING CHANGE -> major, feat: -> minor, fix: / perf: -> patch, anything else -> no release.
// Updates package.json and CHANGELOG.md, and writes `version` and `release` to $GITHUB_OUTPUT.
// A package.json version that has no tag yet (bumped by hand) is released as is.
const fs = require('fs');
const { execFileSync } = require('child_process');

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const dryRun = process.argv.includes('--dry-run');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const current = pkg.version;

function output(values) {
  const lines = Object.entries(values).map(([k, v]) => `${k}=${v}`);
  console.log(lines.join('\n'));
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n');
}

if (!git('tag', '-l', `v${current}`)) {
  output({ version: current, release: true, bumped: false });
  process.exit(0);
}

const LEVELS = ['none', 'patch', 'minor', 'major'];
const commits = git('log', `v${current}..HEAD`, '--format=%s%x1f%b%x1e')
  .split('\x1e')
  .map((c) => c.trim())
  .filter(Boolean)
  .map((c) => {
    const [subject, body = ''] = c.split('\x1f');
    const m = subject.match(/^(\w+)(?:\([^)]*\))?(!)?:\s*(.+)$/);
    if (!m) return { level: 0 };
    const [, type, bang, text] = m;
    let level = type === 'feat' ? 2 : type === 'fix' || type === 'perf' ? 1 : 0;
    if (bang || /^BREAKING[ -]CHANGE:/m.test(body)) level = 3;
    return { level, text: text.charAt(0).toUpperCase() + text.slice(1) };
  });

const level = Math.max(0, ...commits.map((c) => c.level));
if (level === 0) {
  output({ version: current, release: false, bumped: false });
  process.exit(0);
}

let [major, minor, patch] = current.split('.').map(Number);
if (level === 3) [major, minor, patch] = [major + 1, 0, 0];
else if (level === 2) [minor, patch] = [minor + 1, 0];
else patch += 1;
const next = `${major}.${minor}.${patch}`;

// Oldest first, so the list reads in the order things happened.
const notes = commits
  .filter((c) => c.level > 0)
  .reverse()
  .map((c) => `- ${c.text}`)
  .join('\n');

if (!dryRun) {
  pkg.version = next;
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
  fs.writeFileSync('CHANGELOG.md', changelog.replace(/^# Changelog\n/, `# Changelog\n\n## ${next}\n\n${notes}\n`));
} else {
  console.log(`--- notes for ${next} ---\n${notes}`);
}
output({ version: next, release: true, bumped: true });
