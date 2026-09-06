---
name: integrations
description: Discover and call the tools a connected integration exposes — Linear, GitHub, Sentry, Notion, or any other plugin — through `superset mcp`. Use when the user wants something done in a connected service, asks what an integration can do or which tools it has, wants a specific tool called, or asks why an integration's tools are failing.
argument-hint: what you want done in a connected service
allowed-tools: Bash(superset mcp:*) Bash(superset plugins:*) Bash(superset skills:*)
---

# Calling an integration's tools

An integration is an installed plugin with a connected account. Its tools do not run here:
`superset mcp` hands the call to Superset's API, which attaches the stored credential and
forwards it to the plugin's MCP server. No token is ever written to this machine, which is
also why a sandbox with no route to Linear can still file a Linear issue.

Installing, connecting, and marketplaces belong to the `plugins` skill. This one starts once
something is connected, and it is two steps: list the tools, then call one.

## 1. Find the integration

```bash
superset plugins list                     # everything installed, one row per connected account
superset plugins connections --plugin linear
```

Read the `STATUS` column. `connected: <account>` is callable. `needs connection` means the
skills are installed but no account is authorized — the tools will fail, and that is a connect
step, not a bug. `PLUGIN ID` holds the connection id; a plugin with two accounts has two rows
and two ids.

## 2. List the tools before calling one

```bash
superset mcp tools linear
superset mcp tools --connection <id>              # when the name has several accounts
superset mcp tools linear | jq -r '.[].tool'      # names only; descriptions run long
```

Names and descriptions come from the plugin's own server, not from anything in this repo, and
they change between plugin versions. Never call a tool you have not listed.

The listing gives a name and a description — **not an input schema**. The description is where
the plugin documents its arguments, so read the full description of the tool you are about to
call rather than the filtered name list. If the shape is still ambiguous, a wrong call comes
back as a tool error naming the offending field; correct it from there.

## 3. Call it

```bash
superset mcp call-tool linear list_issues
superset mcp call-tool linear create_issue '{"team":"ENG","title":"Export 500s"}'
echo '{"team":"ENG","title":"..."}' | superset mcp call-tool linear create_issue -
superset mcp call-tool linear create_issue --connection <id> '{"team":"ENG","title":"..."}'
```

The plugin name is the first positional and the tool name the second, always. `--connection`
picks the account; it does not stand in for the plugin positional. Arguments are the third
positional, default `{}`, and `-` reads them from stdin — use stdin for anything secret, since
an argument is visible in `ps` and in shell history.

What comes back is the MCP result verbatim: a `content` array whose text parts are usually
themselves JSON strings.

```bash
superset mcp call-tool linear list_issues | jq -r '.content[0].text' | jq
```

## Reading a failure

| What you see | What it means |
| --- | --- |
| `"x" is not connected. Connect an account first.` | Nothing is authorized under that name. Also what an uninstalled plugin looks like. Run `superset plugins connect x`, or install it first. |
| `"x" has N connected accounts; choose one:` | The CLI refuses to guess and prints a `--connection <id>` line per account. Ask the user which account, do not take the first. |
| `Name a plugin, or pass --connection <id>.` | `superset mcp tools` with no target. |
| `Missing required argument: <tool>` | `call-tool` takes the plugin, then the tool. |
| `Arguments must be JSON: ...` | The third positional is a JSON object, quoted as one shell word. |
| 401 or 403 from the tool itself | The stored credential was revoked or expired. Reconnect the account. |
| `needs connection` in `plugins list` | Installed, unauthorized. Nothing you pass to `mcp` fixes this. |

## Anti-patterns

- Calling a tool without listing tools first. You are guessing at a name and a schema the
  plugin owns.
- `--plugin-id`. Deprecated alias for `--connection`.
- Passing a credential as a command argument when the command reads stdin.
- Picking one of several connected accounts yourself. Which account acts is the user's call.
- Reaching for `superset plugins sync` when a call fails on authorization. Sync converges
  skills on this machine; it has nothing to do with credentials.
- Installing or connecting a plugin to see what it offers. That writes to the user's account
  and reaches every machine they sign in on — ask first, and use the `plugins` skill.
