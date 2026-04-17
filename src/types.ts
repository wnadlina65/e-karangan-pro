/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Role = 'student' | 'teacher';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  teacherId?: string; // For students to associate with a teacher
}

export type EssayStatus = 'draft' | 'submitted' | 'reviewed';

export interface Essay {
  id: string;
  userId: string;
  userName: string;
  teacherId: string; // The teacher who should grade this essay
  title: string;
  content: string;
  section: 'A' | 'B'; // Bahagian A or Bahagian B
  marks: number; // -1 if not graded
  feedback: string;
  status: EssayStatus;
  createdAt: string;
}

export interface GradeInfo {
  text: string;
  color: string;
  stars: number;
}
