# Commit Message Generator for Claude Code

Click the ✨ button in the Source Control view and a commit message for your changes is written into the commit box.

It runs through the **Claude Code CLI you are already logged into**, so there is no API key to set up.

## Features

- **One click:** a ✨ button in the Source Control title bar.
- **Streams in:** the message appears in the commit box as it is written, usually in about 3 seconds.
- **Stop any time:** while it is writing, the button becomes ⏹.
- **Staged-aware:** if you have staged changes, only those are described. Otherwise it describes all changes, including new files.
- **Matches your style:** your recent commit subjects are included, so the message follows your conventions. The format is Conventional Commits (`feat: …`, `fix: …`).
- Works on Windows, macOS, Linux, WSL and Remote SSH.

## Requirements

- [Claude Code](https://claude.com/claude-code) installed and logged in (`claude` must work in a terminal).
- Git.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `claudeCommitMsg.model` | `haiku` | `haiku` (fastest), `sonnet`, `opus` |
| `claudeCommitMsg.language` | `English` | Language of the message |
| `claudeCommitMsg.maxDiffChars` | `60000` | Longer diffs are truncated |
| `claudeCommitMsg.claudePath` | `claude` | Path to the CLI if it is not on your PATH |

## Privacy

Your diff and your last 10 commit subjects are sent to Anthropic through your own Claude Code session. Nothing else is collected.

---

This is an independent project. It is not affiliated with or endorsed by Anthropic. "Claude" and "Claude Code" are trademarks of Anthropic, PBC.
