# Commit Message Generator for Claude Code

A **Visual Studio Code extension** that writes your Git commit messages, and names new branches, with Claude Code.

**Install:** [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=halilkaplan.claude-code-commit-message), or search for *Commit Message Generator for Claude Code* in the VS Code Extensions view (`Ctrl+Shift+X`). A `.vsix` for manual install is on the [Releases](https://github.com/Halil-KAPLAN/claude-code-commit-message/releases) page.

It adds two buttons to the title bar of the Source Control view:

| Button | What it does |
| --- | --- |
| ✨ **Generate Commit Message** | Writes a commit message for your changes into the commit box. |
| ⎇ **Generate New Branch from Changes** | Suggests a branch name for your changes, then creates the branch and switches to it. |

It runs through the **Claude Code CLI you are already logged into**, so there is no API key to set up.

## Commit messages

Click ✨ and the message is written into the commit box.

- **Streams in:** the message appears as it is written, usually in about 3 seconds.
- **Stop any time:** while it is writing, the button becomes ⏹.
- **Staged-aware:** if you have staged changes, only those are described. Otherwise it describes all changes, including new files.
- **Matches your style:** your recent commit subjects are included, so the message follows your conventions. The format is Conventional Commits (`feat: …`, `fix: …`).
- **Your language:** set `claudeCommitMsg.language` to get messages in Turkish, German, and other languages.

## Branch names

Started working on `main` and want a branch for it? Click ⎇, right next to ✨.

1. Claude suggests a short name such as `feat/add-login-page` in about 3 seconds, following the style of your existing branches.
2. The name opens in an input box, where you can edit it. Invalid names and names that already exist are flagged.
3. Press Enter: the branch is created and checked out. Your uncommitted changes come along.

Also available under **⋯ → Branch → Generate New Branch from Changes (Claude)** and in the Command Palette. Branch names are always lowercase English, whatever the message language is.

## Good to know

- Works on Windows, macOS, Linux, WSL and Remote SSH.
- If Claude Code is not logged in, you get a **Log In** button that opens a terminal to log in. If the CLI is not installed, you get a link to install it.

## Requirements

- [Claude Code](https://claude.com/claude-code) installed and logged in (`claude` must work in a terminal). Usage counts against the account the CLI is logged in with.
- [Visual Studio Code](https://code.visualstudio.com/) 1.90 or newer.
- Git.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `claudeCommitMsg.model` | `haiku` | `haiku` (fastest), `sonnet`, `opus`. Used for both features. |
| `claudeCommitMsg.language` | `English` | Language of the commit message |
| `claudeCommitMsg.maxDiffChars` | `60000` | Longer diffs are truncated |
| `claudeCommitMsg.claudePath` | `claude` | Path to the CLI if it is not on your PATH |

## Installing without the Marketplace

Download the `.vsix` from [Releases](https://github.com/Halil-KAPLAN/claude-code-commit-message/releases), then in VS Code: **Extensions → ⋯ → Install from VSIX…**

## Privacy

Your diff and your last 10 commit subjects (for branch names: your local branch names) are sent to Anthropic through your own Claude Code session. Nothing else is collected.

---

This is an independent project. It is not affiliated with or endorsed by Anthropic. "Claude" and "Claude Code" are trademarks of Anthropic, PBC.
