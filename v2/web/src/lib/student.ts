/**
 * Lightweight identity: the student's id lives in localStorage after they
 * "save their progress". First interview stays signup-free.
 */

const ID_KEY = 'interview.studentId';
const NAME_KEY = 'interview.studentName';

export function getStudentId(): string | null {
  return localStorage.getItem(ID_KEY);
}

export function getStudentName(): string {
  return localStorage.getItem(NAME_KEY) ?? '';
}

export function setStudent(id: string, name: string): void {
  localStorage.setItem(ID_KEY, id);
  localStorage.setItem(NAME_KEY, name);
}

export function clearStudent(): void {
  localStorage.removeItem(ID_KEY);
  localStorage.removeItem(NAME_KEY);
}
