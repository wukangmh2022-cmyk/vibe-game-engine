Git Commit & Push 命令
description: Automatically generate commit message, commit changes, and push to remote repository
argument-hint: [commit-type] [optional-message]
allowed-tools: [Bash, Grep, LS, Read]
Git Commit and Push
Automatically analyzes code changes, generates a standardized commit message following conventional commits format, commits the changes, and pushes to the remote repository.

Usage:
/git:commit-push [commit-type] [optional-message]

Arguments:
commit-type (optional): Type of commit (feat, fix, docs, style, refactor, test, chore). If not provided, will be auto-detected based on changes.
optional-message (optional): Additional message to append to the generated commit message.
Process:
Check git status to ensure there are changes to commit
Analyze staged and unstaged changes using git diff
Determine commit type based on file changes if not provided
Generate conventional commit message (lowercase, max 70 chars)
Add unstaged files to staging area
Commit with generated message including Claude Code attribution
Push changes to remote repository
Provide feedback on the operation status
Examples:
/git:commit-push - Auto-detect type and generate commit message
/git:commit-push feat - Force commit type to “feat”
/git:commit-push fix "resolve login issue" - Use “fix” type with custom message
/git:commit-push docs - Document changes commit
Commit Type Detection Rules:
feat: New features (new files, major functionality additions)
fix: Bug fixes (modifications in src/, lib/, or core files)
docs: Documentation (README, .md files, comments)
style: Code formatting, semicolons, etc. (no logic changes)
refactor: Code restructuring without changing functionality
test: Adding or modifying tests
chore: Build process, dependencies, tooling changes
Generated Commit Message Format:
type: brief description of changes

The commit message will be generated in the same language style as the project’s existing commits. For this project, it will use Chinese descriptions following the pattern seen in recent commits.

Examples:

feat: 添加用户认证系统
fix: 修复数据处理中的内存泄漏
docs: 更新API文档
Error Handling:
Validates that we’re in a git repository
Checks for uncommitted changes
Handles merge conflicts
Provides clear error messages for common issues
Ensures remote repository is accessible before pushing
Notes:
Follows project convention of lowercase commit messages with 70 character limit
Automatically includes Claude Code attribution in commit body
Skips push if remote tracking branch is not set up
Provides detailed feedback on each step of the process
Handles both staged and unstaged files appropriately