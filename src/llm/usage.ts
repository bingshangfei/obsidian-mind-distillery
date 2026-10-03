import type { ChatUsage } from "./provider";

export interface UsageRecord {
	at: string;
	call: string;
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

export interface UsageTotals {
	calls: number;
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

const emptyTotals = (): UsageTotals => ({ calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 });

/**
 * Token accounting, keyed by call site (classify/summarize/card/reviewCard/quiz/…).
 * Totals are persisted by the host (data.json); records stay in memory, bounded.
 */
export class UsageLedger {
	private readonly records: UsageRecord[] = [];
	private readonly byCall = new Map<string, UsageTotals>();

	add(call: string, usage: ChatUsage): UsageRecord {
		const record: UsageRecord = {
			at: new Date().toISOString(),
			call,
			promptTokens: usage.promptTokens,
			completionTokens: usage.completionTokens,
			totalTokens: usage.totalTokens,
		};
		this.records.push(record);
		if (this.records.length > 500) this.records.shift();

		const totals = this.byCall.get(call) ?? emptyTotals();
		totals.calls += 1;
		totals.promptTokens += usage.promptTokens;
		totals.completionTokens += usage.completionTokens;
		totals.totalTokens += usage.totalTokens;
		this.byCall.set(call, totals);
		return record;
	}

	total(): UsageTotals {
		const all = emptyTotals();
		for (const t of this.byCall.values()) {
			all.calls += t.calls;
			all.promptTokens += t.promptTokens;
			all.completionTokens += t.completionTokens;
			all.totalTokens += t.totalTokens;
		}
		return all;
	}

	perCall(): Array<{ call: string } & UsageTotals> {
		return [...this.byCall.entries()]
			.map(([call, t]) => ({ call, ...t }))
			.sort((a, b) => b.totalTokens - a.totalTokens);
	}

	/** Serializable snapshot for persistence across reloads. */
	snapshot(): UsageTotals {
		return this.total();
	}

	/** Clear the running totals (settings "Reset" button). */
	reset(): void {
		this.records.length = 0;
		this.byCall.clear();
	}

	restore(totals: UsageTotals | undefined): void {
		if (!totals) return;
		// Rehydrated history is kept as a synthetic bucket so per-reload records never double count.
		this.byCall.set("history", totals);
	}
}
