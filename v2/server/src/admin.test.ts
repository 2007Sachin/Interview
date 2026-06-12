import { describe, expect, it } from 'vitest';
import { buildOverview, buildRoster } from './admin.js';
import { emptyCost } from './cost.js';
import type { Report, Session, Student } from './types.js';

function student(id: string, batch: string, isAdmin = false): Student {
  return {
    id,
    handle: `${id}@demo.edu`,
    name: id,
    createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
    institution: 'demo.edu',
    batch,
    isAdmin,
  };
}

function session(studentId: string, daysAgo: number, score: number, fixTitle: string): Session {
  const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString();
  const report: Report = {
    overall: {
      score,
      readinessLevel: score >= 78 ? 'interview-ready' : score >= 58 ? 'developing' : 'needs practice',
      summary: 's',
    },
    highlights: [],
    oneThingToFix: { title: fixTitle, why: '', how: '' },
    swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
    perQuestion: [],
    partial: false,
    progressNote: null,
  };
  return {
    id: `${studentId}-${daysAgo}`,
    createdAt,
    mode: 'skill',
    kind: 'interview',
    inputSummary: 'sql',
    topicKey: 'skill:sql',
    difficulty: 'standard',
    totalQuestions: 8,
    studentId,
    brief: { title: 't', summary: 's', focusAreas: [], questionBank: [], rubric: [] },
    status: 'done',
    currentQuestionIndex: 7,
    followUpUsedForCurrent: false,
    currentPrompt: '',
    currentPromptIsFollowUp: false,
    turns: [],
    report,
    reportStatus: 'ready',
    cost: emptyCost(),
    costUsd: 0.002,
  };
}

const students = [student('a', 'CSE-2026'), student('b', 'ECE-2026'), student('admin', '', true)];
const sessions = [
  session('a', 40, 45, 'Tighten rambling answers'), // before the month window
  session('a', 2, 80, 'Use concrete examples'),
  session('b', 3, 55, 'Tighten rambling answers'),
];

describe('admin aggregates', () => {
  it('overview counts activity, readiness movement and weakness themes', () => {
    const o = buildOverview(students, sessions);
    expect(o.totalStudents).toBe(2); // admin excluded
    expect(o.activeStudentsThisWeek).toBe(2);
    expect(o.interviewsThisWeek).toBe(2);
    expect(o.readinessNow['interview-ready']).toBe(1);
    expect(o.readinessNow['needs practice']).toBe(1);
    // a month ago only the 45-score session existed
    expect(o.readinessMonthAgo['needs practice']).toBe(1);
    expect(o.perDay).toHaveLength(30);
    expect(o.hotTopics[0]?.topicLabel).toBe('sql');
    const rambling = o.commonWeaknesses.find((w) => w.theme.includes('Concise'));
    expect(rambling?.students).toBe(2);
    expect(rambling?.pct).toBe(100);
  });

  it('roster shows trend and latest readiness, excludes admins', () => {
    const roster = buildRoster(students, sessions);
    expect(roster).toHaveLength(2);
    const a = roster.find((r) => r.id === 'a')!;
    expect(a.trend).toBe(1); // 45 → 80
    expect(a.latestReadiness).toBe('interview-ready');
    expect(a.interviews).toBe(2);
  });
});
