// Inside a Superset terminal this names the pane the agent runs in, which is
// what stamps a reply as agent-authored. Outside one there is a person at the
// keyboard, so the reply is posted as theirs.
export function agentSessionId(): string | undefined {
	return process.env.SUPERSET_PANE_ID || process.env.SUPERSET_TERMINAL_ID;
}
