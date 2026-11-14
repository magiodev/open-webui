import { describe, expect, it, vi } from 'vitest';
import { createMessagesList, sanitizeHistory } from './index';

// Shape a client produces when it links a user message to an assistant turn later than it.
const cyclicHistory = () => ({
	currentId: 'a3',
	messages: {
		u1: {
			id: 'u1',
			role: 'user',
			parentId: 'a3',
			childrenIds: ['a1'],
			content: 'one',
			timestamp: 1
		},
		a1: {
			id: 'a1',
			role: 'assistant',
			parentId: 'u1',
			childrenIds: ['u2'],
			content: 'two',
			timestamp: 2
		},
		u2: {
			id: 'u2',
			role: 'user',
			parentId: 'a1',
			childrenIds: ['a3'],
			content: 'three',
			timestamp: 3
		},
		a3: {
			id: 'a3',
			role: 'assistant',
			parentId: 'u2',
			childrenIds: ['u1', 'u2'],
			content: 'four',
			timestamp: 4
		}
	}
});

const linearHistory = () => ({
	currentId: 'a2',
	messages: {
		u1: {
			id: 'u1',
			role: 'user',
			parentId: null,
			childrenIds: ['a1'],
			content: 'one',
			timestamp: 1
		},
		a1: {
			id: 'a1',
			role: 'assistant',
			parentId: 'u1',
			childrenIds: ['u2'],
			content: 'two',
			timestamp: 1
		},
		u2: {
			id: 'u2',
			role: 'user',
			parentId: 'a1',
			childrenIds: ['a2'],
			content: 'three',
			timestamp: 2
		},
		a2: {
			id: 'a2',
			role: 'assistant',
			parentId: 'u2',
			childrenIds: [],
			content: 'four',
			timestamp: 2
		}
	}
});

// Six-message ring from a real corrupted chat, inserted mid-ring so the repair cannot
// just cut whatever node the walk happens to start from.
const ringHistory = () => ({
	currentId: 'b3',
	messages: {
		a1: { id: 'a1', role: 'assistant', parentId: 'r1', childrenIds: ['r2'], timestamp: 100 },
		r2: { id: 'r2', role: 'user', parentId: 'a1', childrenIds: ['a2'], timestamp: 200 },
		a2: { id: 'a2', role: 'assistant', parentId: 'r2', childrenIds: ['r3'], timestamp: 200 },
		r3: { id: 'r3', role: 'user', parentId: 'a2', childrenIds: ['b3'], timestamp: 300 },
		b3: { id: 'b3', role: 'assistant', parentId: 'r3', childrenIds: ['r1'], timestamp: 300 },
		r1: { id: 'r1', role: 'user', parentId: 'b3', childrenIds: ['a1'], timestamp: 100 }
	}
});

describe('createMessagesList', () => {
	it('renders every message of a linear chat, oldest first', () => {
		const list = createMessagesList(linearHistory(), 'a2');
		expect(list.map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a2']);
	});

	it('terminates instead of looping forever on a cyclic chat', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const list = createMessagesList(cyclicHistory(), 'a3');
		warn.mockRestore();
		// Without the visited-set guard this call never returns.
		expect(list.length).toBeGreaterThan(0);
		expect(list.length).toBeLessThanOrEqual(4);
	});
});

describe('sanitizeHistory', () => {
	it('breaks parentId cycles and keeps every message renderable', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const history = cyclicHistory();
		sanitizeHistory(history);
		warn.mockRestore();

		expect(history.messages.u1.parentId).toBeNull();
		expect(history.messages.a3.childrenIds).not.toContain('u1');

		const list = createMessagesList(history, history.currentId);
		expect(list.map((m) => m.id).sort()).toEqual(['a1', 'a3', 'u1', 'u2']);
	});

	it('cuts the link that points backwards in time, not whichever it meets first', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const history = ringHistory();
		sanitizeHistory(history);
		warn.mockRestore();

		expect(history.messages.r1.parentId).toBeNull();
		expect(history.messages.b3.childrenIds).not.toContain('r1');
		expect(history.messages.a1.parentId).toBe('r1');
		expect(history.messages.r2.parentId).toBe('a1');
		expect(history.messages.a2.parentId).toBe('r2');
		expect(history.messages.r3.parentId).toBe('a2');
		expect(history.messages.b3.parentId).toBe('r3');

		const list = createMessagesList(history, history.currentId);
		expect(list).toHaveLength(6);
	});

	it('leaves a well-formed chat untouched', () => {
		const before = linearHistory();
		const after = linearHistory();
		sanitizeHistory(after);
		expect(after).toEqual(before);
	});
});
