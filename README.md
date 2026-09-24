# Commit Message Generator for Claude Code

A **Visual Studio Code extension** that writes your Git commit messages, and names new branches, with Claude Code.

**Install:** [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=halilkaplan.claude-code-commit-message), or search for *Commit Message Generator for Claude Code* in the VS Code Extensions view (`Ctrl+Shift+X`). A `.vsix` for manual install is on the [Releases](https://github.com/Halil-KAPLAN/claude-code-commit-message/releases) page.

Click the ✨ button in the Source Control view and a commit message for your changes is written into the commit box.

It runs through the **Claude Code CLI you are already logged into**, so there is no API key to set up.

## Features

- **One click:** a ✨ button in the Source Control title bar.
- **Streams in:** the message appears in the commit box as it is written, usually in about 3 seconds.
- **Stop any time:** while it is writing, the button becomes ⏹.
- **Staged-aware:** if you have staged changes, only those are described. Otherwise it describes all changes, including new files.
- **Matches your style:** your recent commit subjects are included, so the message follows your conventions. The format is Conventional Commits (`feat: …`, `fix: …`).
- Works on Windows, macOS, Linux, WSL and Remote SSH.

### Branch names from your changes

Started working on `main` and want a branch for it? Click the branch button next to ✨ (also under **⋯ → Branch → Create Branch from Changes (Claude)**, or in the Command Palette).

Claude suggests a short name such as `feat/add-login-page`, following the style of your existing branches. You can edit it, and Enter creates the branch and switches to it. Your uncommitted changes come along.

## Requirements

- [Claude Code](https://claude.com/claude-code) installed and logged in (`claude` must work in a terminal). Usage counts against the account the CLI is logged in with.
- [Visual Studio Code](https://code.visualstudio.com/) 1.90 or newer.
- Git.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `claudeCommitMsg.model` | `haiku` | `haiku` (fastest), `sonnet`, `opus` |
| `claudeCommitMsg.language` | `English` | Language of the message |
| `claudeCommitMsg.maxDiffChars` | `60000` | Longer diffs are truncated |
| `claudeCommitMsg.claudePath` | `claude` | Path to the CLI if it is not on your PATH |

## Installing without the Marketplace

Download the `.vsix` from [Releases](https://github.com/Halil-KAPLAN/claude-code-commit-message/releases), then in VS Code: **Extensions → ⋯ → Install from VSIX…**

## Privacy

Your diff and your last 10 commit subjects (for branch names: your local branch names) are sent to Anthropic through your own Claude Code session. Nothing else is collected.

---

This is an independent project. It is not affiliated with or endorsed by Anthropic. "Claude" and "Claude Code" are trademarks of Anthropic, PBC.
