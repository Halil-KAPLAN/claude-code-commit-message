const vscode = require('vscode');
const cp = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

let current = null; // { child, stopped }

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(cmd, args, { cwd: opts.cwd, shell: opts.shell, env: { ...process.env, ...opts.env } });
    let out = '',
      err = '';
    child.stdout.on('data', (d) => {
      out += d;
      opts.onData && opts.onData(String(d));
    });
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err || `exit ${code}`))));
    if (opts.input !== undefined) child.stdin.end(opts.input);
    if (opts.onSpawn) opts.onSpawn(child);
  });
}

async function buildDiff(gitPath, cwd, maxChars) {
  const git = (args) => run(gitPath, args, { cwd });
  // Staged changes win; otherwise describe everything a "commit all" would include.
  let diff = await git(['diff', '--cached']);
  let scope = 'staged';
  if (!diff.trim()) {
    scope = 'all';
    diff = await git(['diff', 'HEAD']).catch(() => git(['diff']));
    const untracked = (await git(['ls-files', '--others', '--exclude-standard'])).split('\n').filter(Boolean);
    for (const f of untracked.slice(0, 30)) {
      diff += `\nnew file: ${f}\n` + readNewFile(path.join(cwd, f));
    }
  }
  const stat = await git(scope === 'staged' ? ['diff', '--cached', '--stat'] : ['status', '--short']);
  if (diff.length > maxChars) diff = diff.slice(0, maxChars) + '\n[diff truncated]';
  return { diff, stat };
}

function readNewFile(file) {
  try {
    const buf = fs.readFileSync(file);
    if (buf.includes(0)) return '[binary file]\n';
    return (
      buf
        .toString('utf8', 0, 8000)
        .split('\n')
        .map((l) => '+' + l)
        .join('\n') + '\n'
    );
  } catch {
    return '';
  }
}

function pickRepo(api, arg) {
  if (arg && arg.rootUri) return api.repositories.find((r) => r.rootUri.toString() === arg.rootUri.toString());
  return api.repositories.find((r) => r.ui.selected) || api.repositories[0];
}

const MODELS = ['haiku', 'sonnet', 'opus'];

// Windows .cmd/.bat shims (npm installs) can only be started through a shell.
function claudeCommand(bin, args) {
  if (process.platform !== 'win32' || !/\.(cmd|bat)$/i.test(bin)) return { cmd: bin, args, shell: false };
  const q = (a) => '"' + a.replace(/"/g, '""') + '"';
  return { cmd: q(bin), args: args.map(q), shell: true };
}

const clean = (s) =>
  s
    .trim()
    .replace(/^```\w*\n?|\n?```$/g, '')
    .trim();

function setRunning(v) {
  return vscode.commands.executeCommand('setContext', 'claudeCommitMsg.running', v);
}

async function generate(arg) {
  if (current) return;
  const api = vscode.extensions.getExtension('vscode.git').exports.getAPI(1);
  const repo = pickRepo(api, arg);
  if (!repo) return vscode.window.showWarningMessage('No git repository found.');

  const cfg = vscode.workspace.getConfiguration('claudeCommitMsg');
  const cwd = repo.rootUri.fsPath;
  const previous = repo.inputBox.value;
  current = { child: null, stopped: false };
  await setRunning(true);

  try {
    await vscode.window.withProgress({ location: vscode.ProgressLocation.SourceControl }, async () => {
      const { diff, stat } = await buildDiff(
        api.git.path,
        cwd,
        Math.max(2000, Number(cfg.get('maxDiffChars')) || 60000),
      );
      if (!diff.trim()) return vscode.window.showInformationMessage('No changes to describe.');
      if (current.stopped) return;

      const recent = await run(api.git.path, ['log', '-10', '--pretty=%s'], { cwd }).catch(() => '');
      const prompt = [
        `Write a Conventional Commits message in ${cfg.get('language')} for the changes below.`,
        'Subject line: type(optional scope): summary, imperative mood, max 72 chars.',
        'If the change is non-trivial, add a blank line and 2-5 short "- " bullets explaining what changed.',
        'Match the style of the recent commits.',
        '',
        '## Recent commits',
        recent,
        '## Files',
        stat,
        '## Diff',
        diff,
      ].join('\n');

      let text = '',
        buf = '';
      repo.inputBox.value = '';
      const model = MODELS.includes(cfg.get('model')) ? cfg.get('model') : 'haiku';
      const claude = claudeCommand(cfg.get('claudePath') || 'claude', [
        '-p',
        '--model',
        model,
        '--tools',
        '',
        '--strict-mcp-config',
        '--setting-sources',
        '',
        '--no-session-persistence',
        '--output-format',
        'stream-json',
        '--verbose',
        '--include-partial-messages',
        '--system-prompt',
        'You write git commit messages. Output ONLY the commit message text: no quotes, no code fences, no preamble.',
      ]);
      await run(claude.cmd, claude.args, {
        shell: claude.shell,
        // Outside the repo so no CLAUDE.md is loaded; thinking off, it only adds latency here.
        cwd: os.tmpdir(),
        env: { MAX_THINKING_TOKENS: '0' },
        input: prompt,
        onSpawn: (child) => (current.child = child),
        onData: (chunk) => {
          buf += chunk;
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            let ev;
            try {
              ev = JSON.parse(line);
            } catch {
              continue;
            }
            const d = ev.type === 'stream_event' && ev.event.type === 'content_block_delta' && ev.event.delta;
            if (d && d.type === 'text_delta') {
              text += d.text;
              repo.inputBox.value = text;
            } else if (ev.type === 'result' && typeof ev.result === 'string') {
              text = ev.result;
            }
          }
        },
      });
      repo.inputBox.value = clean(text);
    });
  } catch (e) {
    if (current.stopped) {
      if (!repo.inputBox.value.trim()) repo.inputBox.value = previous;
    } else {
      repo.inputBox.value = previous;
      const msg =
        e.code === 'ENOENT'
          ? 'Claude Code CLI not found. Install it (https://claude.com/claude-code) or set "claudeCommitMsg.claudePath".'
          : 'Claude commit message failed: ' + e.message;
      vscode.window.showErrorMessage(msg);
    }
  } finally {
    current = null;
    await setRunning(false);
  }
}

function stop() {
  if (!current) return;
  current.stopped = true;
  if (current.child) current.child.kill();
}

exports.activate = (ctx) => {
  setRunning(false);
  ctx.subscriptions.push(
    vscode.commands.registerCommand('claudeCommitMsg.generate', generate),
    vscode.commands.registerCommand('claudeCommitMsg.stop', stop),
  );
};
exports.deactivate = stop;
