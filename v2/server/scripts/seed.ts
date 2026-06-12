/**
 * Seeds ~30 fake students with varied interview histories so the admin
 * dashboard demos well. Respects STORAGE_BACKEND (file by default).
 *
 *   cd v2/server && npm run seed
 *
 * Also creates one admin login: handle "placement@demo.edu" (isAdmin=true).
 */
import { randomUUID } from 'node:crypto';
import { createStore } from '../src/store/index.js';
import { emptyCost } from '../src/cost.js';
import type { Difficulty, ReadinessLevel, Report, Session, Student } from '../src/types.js';

const FIRST = ['Aarav', 'Diya', 'Ishaan', 'Meera', 'Rohan', 'Sana', 'Kabir', 'Anaya', 'Vivaan', 'Zara', 'Arjun', 'Nia', 'Dev', 'Tara', 'Reyansh', 'Anika', 'Veer', 'Myra', 'Advik', 'Sia', 'Ayaan', 'Pari', 'Krish', 'Riya', 'Atharv', 'Ira', 'Shaurya', 'Navya', 'Yash', 'Aisha'];
const BATCHES = ['CSE-2026', 'ECE-2026', 'MBA-2026', 'MECH-2026'];
const TOPICS = ['sql', 'react', 'python', 'data structures', 'marketing analytics', 'java'];
const DIFFS: Difficulty[] = ['easy', 'standard', 'hard'];
const FIXES = [
  { title: 'Use concrete examples', why: 'Answers stayed abstract without specific evidence.' },
  { title: 'Tighten rambling answers', why: 'Key points got lost in long, unstructured answers.' },
  { title: 'Explain your project clearly', why: 'The project walkthrough was hard to follow.' },
  { title: 'Go deeper on fundamentals', why: 'Technical depth thinned out under follow-ups.' },
  { title: 'Steady your delivery', why: 'Hesitation and filler words undercut good content.' },
];
const WEAKNESSES = [
  'Answers lacked specific examples',
  'Tended to ramble past the point',
  'Project explanation was unclear',
  'Fundamental concepts felt shaky',
  'Noticeably nervous delivery',
];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function readiness(score: number): ReadinessLevel {
  return score >= 78 ? 'interview-ready' : score >= 58 ? 'developing' : 'needs practice';
}

function fakeReport(score: number, attempt: number): Report {
  const fix = rand(FIXES);
  return {
    overall: {
      score,
      readinessLevel: readiness(score),
      summary: 'You showed up and practiced out loud — the report below is seeded demo data.',
    },
    highlights: ['Clear opening answer', 'Good energy on the project question'],
    oneThingToFix: { ...fix, how: 'Practice it in your next rep.' },
    swot: {
      strengths: ['Friendly, composed tone'],
      weaknesses: [rand(WEAKNESSES), rand(WEAKNESSES)],
      opportunities: ['Mock a system design round', 'Practice behavioral stories'],
      threats: ['Tougher follow-ups under time pressure'],
    },
    perQuestion: [],
    partial: false,
    progressNote: attempt > 1 ? 'Last time: vague answers. This time: noticeably tighter — fixed.' : null,
  };
}

function fakeSession(studentId: string, topic: string, daysAgo: number, attempt: number): Session {
  const score = Math.min(95, 35 + attempt * 12 + Math.floor(Math.random() * 18));
  const createdAt = new Date(Date.now() - daysAgo * 24 * 3600 * 1000).toISOString();
  const questions = Array.from({ length: 8 }, (_, i) => `Seeded ${topic} question ${attempt}.${i + 1}?`);
  return {
    id: randomUUID(),
    createdAt,
    mode: 'skill',
    kind: 'interview',
    inputSummary: topic,
    topicKey: `skill:${topic}`,
    difficulty: rand(DIFFS),
    totalQuestions: 8,
    studentId,
    brief: {
      title: `Practice interview: ${topic}`,
      summary: 'Seeded demo session.',
      focusAreas: ['Fundamentals'],
      questionBank: questions,
      rubric: ['Clarity'],
    },
    status: 'done',
    currentQuestionIndex: 7,
    followUpUsedForCurrent: false,
    currentPrompt: '',
    currentPromptIsFollowUp: false,
    turns: questions.map((q, i) => ({
      questionIndex: i,
      prompt: q,
      isFollowUp: false,
      transcript: 'Seeded demo answer.',
      source: 'text' as const,
      answeredAt: createdAt,
    })),
    report: fakeReport(score, attempt),
    reportStatus: 'ready',
    cost: emptyCost(),
    costUsd: Math.round((0.002 + Math.random() * 0.004) * 1e6) / 1e6,
  };
}

async function main() {
  const store = createStore();

  const admin: Student = {
    id: randomUUID(),
    handle: 'placement@demo.edu',
    name: 'Placement Office',
    createdAt: new Date().toISOString(),
    institution: 'demo.edu',
    batch: '',
    isAdmin: true,
  };
  if (!(await store.getStudentByHandle(admin.handle))) await store.createStudent(admin);
  console.log(`admin login → handle ${admin.handle}, studentId ${admin.id}`);

  let sessions = 0;
  for (let i = 0; i < 30; i++) {
    const name = FIRST[i % FIRST.length]!;
    const handle = `${name.toLowerCase()}${i}@demo.edu`;
    if (await store.getStudentByHandle(handle)) continue;
    const student: Student = {
      id: randomUUID(),
      handle,
      name,
      createdAt: new Date(Date.now() - (40 + i) * 24 * 3600 * 1000).toISOString(),
      institution: 'demo.edu',
      batch: rand(BATCHES),
      isAdmin: false,
    };
    await store.createStudent(student);

    // Varied histories: some new, some grinding, some interview-ready.
    const attempts = 1 + Math.floor(Math.random() * 5);
    const topic = rand(TOPICS);
    for (let a = 1; a <= attempts; a++) {
      const daysAgo = Math.max(0, Math.floor(Math.random() * 28) - a * 3);
      await store.create(fakeSession(student.id, topic, daysAgo, a));
      sessions++;
    }
    if (Math.random() > 0.6) {
      await store.create(fakeSession(student.id, rand(TOPICS), Math.floor(Math.random() * 10), 1));
      sessions++;
    }
  }
  console.log(`seeded 30 students, ${sessions} interviews`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
