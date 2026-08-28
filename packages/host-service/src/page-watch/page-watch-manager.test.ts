import { describe, expect, it } from "bun:test";
import {
	HEARTBEAT_INTERVAL_MS,
	IDLE_TTL_MS,
	MAX_CONSECUTIVE_FAILURES,
	MAX_HOLD_MS,
	MAX_WATCHERS,
	PageWatchManager,
} from "./page-watch-manager.ts";
import type { WatchedThread } from "./types.ts";

const T0 = 1_800_000_000_000;

function humanThread(id: string, at: number): WatchedThread {
	return {
		id,
		anchorKind: "element",
		anchor: { path: "div > p", tag: "p" },
		anchorText: "axis",
		resolved: false,
		version: 1,
		comments: [
			{
				id: `c-${id}`,
				body: "the axis is wrong",
				authorKind: "human",
				authorName: "Sarah",
				createdAt: new Date(at),
			},
		],
	};
}

function harness(
	options: {
		threads?: WatchedThread[];
		listThreads?: (pageId: string) => Promise<WatchedThread[]>;
		alive?: Set<string>;
		busy?: Set<string>;
	} = {},
) {
	const sent: { terminalId: string; text: string }[] = [];
	const setWatchCalls: { pageId: string; agentId: string | null }[] = [];
	const clearWatchCalls: string[] = [];
	const alive = options.alive ?? new Set(["term-1"]);
	const busy = options.busy ?? new Set<string>();
	let sendFails = false;
	let clock = T0;

	const manager = new PageWatchManager({
		api: {
			listThreads: options.listThreads ?? (async () => options.threads ?? []),
			setWatch: async (pageId, agentId) => {
				setWatchCalls.push({ pageId, agentId });
			},
			clearWatch: async (pageId) => {
				clearWatchCalls.push(pageId);
			},
		},
		sendToTerminal: async ({ terminalId, text }) => {
			if (sendFails) throw new Error("terminal gone");
			sent.push({ terminalId, text });
		},
		isTerminalAlive: (terminalId) => alive.has(terminalId),
		isAgentBusy: (terminalId) => busy.has(terminalId),
		now: () => clock,
		setIntervalFn: (() => {
			const handle = { unref() {} };
			return handle as unknown as ReturnType<typeof setInterval>;
		}) as unknown as typeof setInterval,
		clearIntervalFn: (() => {}) as unknown as typeof clearInterval,
	});

	const assign = (over: Partial<{ pageId: string; terminalId: string }> = {}) =>
		manager.assign({
			pageId: over.pageId ?? "page-1",
			slug: "report-a1b2c3",
			title: "Report",
			workspaceId: "ws-1",
			terminalId: over.terminalId ?? "term-1",
			agentId: "claude",
		});

	return {
		manager,
		sent,
		setWatchCalls,
		clearWatchCalls,
		alive,
		busy,
		assign,
		failSends: (value: boolean) => {
			sendFails = value;
		},
		advance: (ms: number) => {
			clock += ms;
		},
		at: () => clock,
	};
}

describe("PageWatchManager", () => {
	it("delivers a new human comment to the assigned terminal", async () => {
		const h = harness({ threads: [humanThread("t1", T0 + 5_000)] });
		h.assign();
		h.advance(5_000);
		await h.manager.tick();

		expect(h.sent.length).toBe(1);
		expect(h.sent[0]?.terminalId).toBe("term-1");
		expect(h.sent[0]?.text).toContain("thread: t1");
		expect(h.sent[0]?.text).toContain("report-a1b2c3");
	});

	it("does not redeliver the same comment on the next tick", async () => {
		const h = harness({ threads: [humanThread("t1", T0 + 5_000)] });
		h.assign();
		h.advance(5_000);
		await h.manager.tick();
		h.advance(10_000);
		await h.manager.tick();

		expect(h.sent.length).toBe(1);
	});

	it("watches many pages for one agent", async () => {
		const h = harness({ threads: [humanThread("t1", T0 + 5_000)] });
		h.assign({ pageId: "page-1" });
		h.assign({ pageId: "page-2" });
		h.advance(5_000);
		await h.manager.tick();

		expect(h.manager.list("ws-1").length).toBe(2);
		expect(h.sent.length).toBe(2);
	});

	it("drops every page for a terminal that exits, and clears each cloud row", async () => {
		const h = harness();
		h.assign({ pageId: "page-1" });
		h.assign({ pageId: "page-2" });
		h.assign({ pageId: "page-3", terminalId: "term-2" });
		h.alive.add("term-2");

		h.alive.delete("term-1");
		await h.manager.tick();

		expect(h.manager.list().map((w) => w.pageId)).toEqual(["page-3"]);
		expect(h.clearWatchCalls.sort()).toEqual(["page-1", "page-2"]);
	});

	it("refuses to exceed the watcher cap", () => {
		const h = harness();
		for (let i = 0; i < MAX_WATCHERS; i += 1) h.assign({ pageId: `page-${i}` });
		expect(() => h.assign({ pageId: "one-too-many" })).toThrow();
		expect(h.manager.list().length).toBe(MAX_WATCHERS);
	});

	it("lets a reassignment of an existing page through the cap", () => {
		const h = harness();
		for (let i = 0; i < MAX_WATCHERS; i += 1) h.assign({ pageId: `page-${i}` });
		expect(() => h.assign({ pageId: "page-0" })).not.toThrow();
	});

	it("retires a page that has been quiet past the TTL", async () => {
		const h = harness();
		h.assign();
		h.advance(IDLE_TTL_MS + 1);
		await h.manager.tick();

		expect(h.manager.list()).toEqual([]);
		expect(h.clearWatchCalls).toEqual(["page-1"]);
	});

	it("gives up after consecutive failures rather than retrying forever", async () => {
		let calls = 0;
		const h = harness({
			listThreads: async () => {
				calls += 1;
				throw new Error("offline");
			},
		});
		h.assign();

		for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i += 1) {
			h.advance(1_000);
			await h.manager.tick();
		}

		expect(calls).toBe(MAX_CONSECUTIVE_FAILURES);
		expect(h.manager.list()).toEqual([]);

		h.advance(1_000);
		await h.manager.tick();
		expect(calls).toBe(MAX_CONSECUTIVE_FAILURES);
	});

	it("recovers its failure count after a success", async () => {
		let fail = true;
		const h = harness({
			listThreads: async () => {
				if (fail) throw new Error("offline");
				return [];
			},
		});
		h.assign();

		for (let i = 0; i < MAX_CONSECUTIVE_FAILURES - 1; i += 1) {
			h.advance(1_000);
			await h.manager.tick();
		}
		fail = false;
		h.advance(1_000);
		await h.manager.tick();

		fail = true;
		for (let i = 0; i < MAX_CONSECUTIVE_FAILURES - 1; i += 1) {
			h.advance(1_000);
			await h.manager.tick();
		}
		expect(h.manager.list().length).toBe(1);
	});

	it("heartbeats no more than once per heartbeat interval", async () => {
		const h = harness();
		h.assign();

		h.advance(1_000);
		await h.manager.tick();
		expect(h.setWatchCalls.length).toBe(1);

		h.advance(1_000);
		await h.manager.tick();
		expect(h.setWatchCalls.length).toBe(1);

		h.advance(HEARTBEAT_INTERVAL_MS);
		await h.manager.tick();
		expect(h.setWatchCalls.length).toBe(2);
	});

	it("stops touching the cloud once every watcher is gone", async () => {
		const h = harness();
		h.assign();
		await h.manager.unwatch("page-1");

		const before = h.setWatchCalls.length;
		h.advance(HEARTBEAT_INTERVAL_MS * 2);
		await h.manager.tick();
		expect(h.setWatchCalls.length).toBe(before);
	});

	it("retries a comment whose delivery failed instead of dropping it", async () => {
		const h = harness({ threads: [humanThread("t1", T0 + 5_000)] });
		h.assign();
		h.failSends(true);
		h.advance(5_000);
		await h.manager.tick();
		expect(h.sent.length).toBe(0);
		expect(h.manager.list().length).toBe(1);

		h.failSends(false);
		h.advance(5_000);
		await h.manager.tick();
		expect(h.sent.length).toBe(1);
		expect(h.sent[0]?.text).toContain("thread: t1");
	});

	it("gives up after repeated send failures rather than retrying forever", async () => {
		const h = harness({ threads: [humanThread("t1", T0 + 5_000)] });
		h.assign();
		h.failSends(true);
		for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i += 1) {
			h.advance(5_000);
			await h.manager.tick();
		}
		expect(h.manager.list()).toEqual([]);
	});

	it("holds delivery while the agent is working", async () => {
		const h = harness({ threads: [humanThread("t1", T0 + 5_000)] });
		h.assign();
		h.busy.add("term-1");
		h.advance(5_000);
		await h.manager.tick();
		expect(h.sent.length).toBe(0);

		h.advance(5_000);
		await h.manager.tick();
		expect(h.sent.length).toBe(0);

		h.busy.delete("term-1");
		h.advance(5_000);
		await h.manager.tick();
		expect(h.sent.length).toBe(1);
	});

	it("batches everything that arrived while the agent was busy into one send", async () => {
		const threads = [humanThread("t1", T0 + 1_000)];
		const h = harness({ listThreads: async () => threads });
		h.assign();
		h.busy.add("term-1");
		h.advance(5_000);
		await h.manager.tick();

		threads.push(humanThread("t2", T0 + 6_000));
		h.advance(5_000);
		await h.manager.tick();
		expect(h.sent.length).toBe(0);

		h.busy.delete("term-1");
		h.advance(5_000);
		await h.manager.tick();
		expect(h.sent.length).toBe(1);
		expect(h.sent[0]?.text).toContain("thread: t1");
		expect(h.sent[0]?.text).toContain("thread: t2");
	});

	it("stops holding once the max hold elapses, so a wedged agent still hears", async () => {
		const h = harness({ threads: [humanThread("t1", T0 + 5_000)] });
		h.assign();
		h.busy.add("term-1");
		h.advance(5_000);
		await h.manager.tick();
		expect(h.sent.length).toBe(0);

		h.advance(MAX_HOLD_MS);
		await h.manager.tick();
		expect(h.sent.length).toBe(1);
	});

	it("does not hold when the agent is idle", async () => {
		const h = harness({ threads: [humanThread("t1", T0 + 5_000)] });
		h.assign();
		h.advance(5_000);
		await h.manager.tick();
		expect(h.sent.length).toBe(1);
	});
});
