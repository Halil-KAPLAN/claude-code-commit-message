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

// Runs one prompt through the Claude Code CLI; onText receives the text so far while it streams.
async function askClaude(prompt, { system, onText }) {
  const cfg = vscode.workspace.getConfiguration('claudeCommitMsg');
  let text = '',
    buf = '',
    failure = null;
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
    system,
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
          if (onText) onText(text);
        } else if (ev.type === 'assistant' && ev.error) {
          failure = { code: ev.error };
        } else if (ev.type === 'result') {
          // The CLI exits 0 on API/auth errors; the error text arrives here as the "result".
          if (ev.is_error) failure = { code: (failure && failure.code) || ev.terminal_reason, text: ev.result };
          else if (typeof ev.result === 'string') text = ev.result;
        }
      }
    },
  });
  if (failure) {
    const err = new Error(failure.text || failure.code || 'Unknown error');
    err.code = failure.code;
    throw err;
  }
  return text;
}

// From the git extension's already-loaded state, so there is nothing to wait for.
function hasChanges(repo) {
  const st = repo.state;
  return [st.indexChanges, st.workingTreeChanges, st.mergeChanges, st.untrackedChanges].some((c) => c && c.length);
}

function setRunning(v) {
  return vscode.commands.executeCommand('setContext', 'claudeCommitMsg.running', v);
}

async function generate(arg) {
  if (current) return;
  const api = vscode.extensions.getExtension('vscode.git').exports.getAPI(1);
  const repo = pickRepo(api, arg);
  if (!repo) return vscode.window.showWarningMessage('No git repository found.');
  if (!hasChanges(repo)) return void vscode.window.showInformationMessage('No changes to describe.');

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
      if (!diff.trim()) return void vscode.window.showInformationMessage('No changes to describe.');
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

      repo.inputBox.value = '';
      const text = await askClaude(prompt, {
        system:
          'You write git commit messages. Output ONLY the commit message text: no quotes, no code fences, no preamble.',
        onText: (t) => (repo.inputBox.value = t),
      });
      repo.inputBox.value = clean(text);
    });
  } catch (e) {
    if (current.stopped) {
      if (!repo.inputBox.value.trim()) repo.inputBox.value = previous;
    } else {
      repo.inputBox.value = previous;
      showError(e);
    }
  } finally {
    current = null;
    await setRunning(false);
  }
}

// Git-safe, lowercase ASCII: "Feat: Add Login Page!" -> "feat/add-login-page".
function toBranchName(raw) {
  return raw
    .trim()
    .split('\n')[0]
    .replace(/^[`'"]+|[`'"]+$/g, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/-{2,}/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/(^|\/)[-.]+|[-.]+(?=\/|$)/g, '$1')
    .replace(/^\/+|\/+$/g, '')
    .slice(0, 60)
    .replace(/[-./]+$/, '');
}

async function createBranch(arg) {
  if (current) return;
  const api = vscode.extensions.getExtension('vscode.git').exports.getAPI(1);
  const repo = pickRepo(api, arg);
  if (!repo) return vscode.window.showWarningMessage('No git repository found.');
  if (!hasChanges(repo)) return void vscode.window.showInformationMessage('No changes to name a branch after.');

  const cfg = vscode.workspace.getConfiguration('claudeCommitMsg');
  const cwd = repo.rootUri.fsPath;
  const git = (args) => run(api.git.path, args, { cwd });
  current = { child: null, stopped: false };
  await setRunning(true);

  let suggestion, existing;
  try {
    suggestion = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Claude is naming your branch…', cancellable: true },
      async (_, token) => {
        token.onCancellationRequested(stop);
        const { diff, stat } = await buildDiff(
          api.git.path,
          cwd,
          Math.min(20000, Number(cfg.get('maxDiffChars')) || 20000),
        );
        if (!diff.trim()) {
          vscode.window.showInformationMessage('No changes to name a branch after.');
          return;
        }
        const refs = ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)', 'refs/heads'];
        const all = (await git(refs).catch(() => '')).split('\n').filter(Boolean);
        existing = new Set(all);
        // The most recent ones are enough to show the naming style.
        const branches = all.slice(0, 15).join('\n');
        const prompt = [
          'Suggest a short git branch name for the changes below.',
          'Rules: lowercase English words, kebab-case, 2-5 words, at most 40 characters, ASCII only.',
          'Follow the naming style of the existing branches if they share a clear convention (for example a "feat/" or "fix/" prefix);',
          'otherwise use the form type/short-description, where type is feat, fix, refactor, docs or chore.',
          '',
          '## Existing branches',
          branches,
          '## Files',
          stat,
          '## Diff',
          diff,
        ].join('\n');
        const text = await askClaude(prompt, {
          system: 'You name git branches. Output ONLY the branch name: no quotes, no explanation.',
        });
        return toBranchName(text);
      },
    );
  } catch (e) {
    if (!current.stopped) showError(e);
    return;
  } finally {
    current = null;
    await setRunning(false);
  }
  if (!suggestion) return;

  // Same step as the built-in "Create new branch…": the name can be edited before it is created.
  const name = await vscode.window.showInputBox({
    title: 'Create Branch from Changes',
    prompt: 'Press Enter to create and switch to this branch. Your uncommitted changes come along.',
    value: suggestion,
    valueSelection: [suggestion.lastIndexOf('/') + 1, suggestion.length],
    validateInput: async (v) => {
      if (!v.trim()) return 'Enter a branch name.';
      if (existing.has(v.trim())) return `A branch named "${v.trim()}" already exists.`;
      const ok = await run(api.git.path, ['check-ref-format', '--branch', v.trim()], { cwd }).then(
        () => true,
        () => false,
      );
      return ok ? null : 'Not a valid branch name.';
    },
  });
  if (!name) return;
  try {
    await repo.createBranch(name.trim(), true);
  } catch (e) {
    vscode.window.showErrorMessage('Could not create the branch: ' + (e.stderr || e.message));
  }
}

async function showError(e) {
  if (e.code === 'authentication_failed' || /not logged in|\/login/i.test(e.message)) {
    const login = 'Log In';
    const pick = await vscode.window.showErrorMessage(
      'You are not logged in to Claude Code. Log in once in a terminal, then try again.',
      login,
    );
    if (pick === login) openLoginTerminal();
  } else if (e.code === 'ENOENT') {
    const install = 'Install Claude Code';
    const pick = await vscode.window.showErrorMessage(
      'Claude Code CLI not found. Install it, or set "claudeCommitMsg.claudePath".',
      install,
    );
    if (pick === install) vscode.env.openExternal(vscode.Uri.parse('https://claude.com/claude-code'));
  } else {
    vscode.window.showErrorMessage('Claude request failed: ' + e.message);
  }
}

// Interactive `claude` offers the browser login when there is no session.
function openLoginTerminal() {
  const cfg = vscode.workspace.getConfiguration('claudeCommitMsg');
  const bin = cfg.get('claudePath') || 'claude';
  const term = vscode.window.createTerminal({ name: 'Claude Code Login' });
  term.show();
  const quoted = /\s/.test(bin) ? `"${bin}"` : bin;
  term.sendText(process.platform === 'win32' && quoted !== bin ? `& ${quoted}` : quoted);
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
    vscode.commands.registerCommand('claudeCommitMsg.createBranch', createBranch),
  );
};
exports.deactivate = stop;
