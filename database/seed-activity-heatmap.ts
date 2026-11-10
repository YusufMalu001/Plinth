/**
 * seed-activity-heatmap.ts
 *
 * Seeds 365 days of attendance + completed tasks for every employee,
 * calibrated to their ranking (1–10) so the activity heatmap reflects
 * realistic efficiency and attendance scores.
 *
 * Attendance-rate targets by ranking:
 *   10  → 92%   (matches screenshot)
 *    9  → 88%
 *    8  → 85%
 *   5–7 → 78%
 *   2–4 → 72%
 *    1  → 65%
 *
 * Task completion: 0–3 per week, weighted by ranking.
 * Saturdays/Sundays are marked HOLIDAY (no workHours).
 */

import { PrismaClient, AttendanceStatus, TaskPriority, TaskStatus } from '@prisma/client';

const prisma = new PrismaClient();

// ── Deterministic pseudo-random (seeded by employeeId + day offset) ────────
function seededRand(seed: number): number {
  // Xorshift32
  let x = seed >>> 0;
  if (x === 0) x = 1;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  return (x >>> 0) / 0xffffffff;
}

function dayHash(employeeId: string, dayOffset: number): number {
  // Mix employee id hash with day offset
  let h = dayOffset * 2654435761;
  for (let i = 0; i < employeeId.length; i++) {
    h = Math.imul(h ^ employeeId.charCodeAt(i), 0x9e3779b9);
  }
  return h >>> 0;
}

// ── Attendance probability by ranking ────────────────────────────────────────
function attendanceRate(ranking: number): number {
  if (ranking >= 10) return 0.92;
  if (ranking === 9)  return 0.88;
  if (ranking === 8)  return 0.85;
  if (ranking >= 5)   return 0.78;
  if (ranking >= 2)   return 0.72;
  return 0.65;
}

// ── Tasks per week probability by ranking ────────────────────────────────────
// Returns expected completed tasks for a given day (fractional, used as prob)
function dailyTaskCompletionChance(ranking: number): number {
  // ~tasks per week: rank10→2.5, rank8→2, rank5→1.2, rank1→0.4
  const perWeek = Math.max(0.3, (ranking / 10) * 2.8);
  return perWeek / 5; // per working day
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function seedActivityHeatmap() {
  console.log('🗓️  Seeding activity heatmap data for all employees...');

  const employees = await prisma.employee.findMany({
    select: { id: true, employeeCode: true, firstName: true, lastName: true, ranking: true },
  });

  console.log(`   Found ${employees.length} employees`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let totalAttendance = 0;
  let totalTasks = 0;

  for (const emp of employees) {
    const ranking = emp.ranking ?? 1;
    const pAttend = attendanceRate(ranking);
    const pTask = dailyTaskCompletionChance(ranking);

    const attendanceUpserts: Array<{
      employeeId: string;
      date: Date;
      status: AttendanceStatus;
      workHours: number | null;
      markedBy: string;
    }> = [];

    const taskInserts: Array<{
      employeeId: string;
      title: string;
      status: TaskStatus;
      priority: TaskPriority;
      completedAt: Date;
      createdAt: Date;
      updatedAt: Date;
    }> = [];

    for (let offset = 364; offset >= 0; offset--) {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);

      const dow = date.getDay(); // 0=Sun, 6=Sat
      const isWeekend = dow === 0 || dow === 6;
      const seed = dayHash(emp.id, offset);
      const r1 = seededRand(seed);
      const r2 = seededRand(seed ^ 0xdeadbeef);
      const r3 = seededRand(seed ^ 0xabcd1234);

      if (isWeekend) {
        // Weekend → HOLIDAY (no work)
        attendanceUpserts.push({
          employeeId: emp.id,
          date,
          status: AttendanceStatus.HOLIDAY,
          workHours: null,
          markedBy: 'SYSTEM',
        });
        continue;
      }

      // Working day attendance
      let status: AttendanceStatus;
      let workHours: number | null;

      if (r1 < pAttend) {
        // Present — occasionally HALF_DAY
        if (r2 < 0.05) {
          status = AttendanceStatus.HALF_DAY;
          workHours = 4 + Math.round(r3 * 2);
        } else {
          status = AttendanceStatus.PRESENT;
          workHours = 8 + (r2 < 0.3 ? 0.5 : 0);
        }
      } else {
        // Absent split: sick leave / casual / unpaid / absent
        const roll = r2;
        if (roll < 0.35) { status = AttendanceStatus.LEAVE_SICK;    workHours = null; }
        else if (roll < 0.60) { status = AttendanceStatus.LEAVE_CASUAL;  workHours = null; }
        else if (roll < 0.75) { status = AttendanceStatus.LEAVE_UNPAID;  workHours = null; }
        else                  { status = AttendanceStatus.ABSENT;         workHours = null; }
      }

      attendanceUpserts.push({ employeeId: emp.id, date, status, workHours, markedBy: 'SYSTEM' });

      // Task completion on this day (only when present)
      if ((status === AttendanceStatus.PRESENT || status === AttendanceStatus.HALF_DAY) && r3 < pTask) {
        // 1–2 tasks completed on this day
        const count = r2 < 0.3 ? 2 : 1;
        for (let t = 0; t < count; t++) {
          const priorities: TaskPriority[] = [TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH, TaskPriority.URGENT];
          const pIdx = Math.floor(seededRand((seed ^ t) * 31337) * 4);
          const titles = [
            'Complete daily production report',
            'Review quality inspection log',
            'Update inventory records',
            'Process pending purchase order',
            'Conduct team standup meeting',
            'Prepare shift handover notes',
            'Inspect finished goods batch',
            'Audit material consumption',
            'Submit weekly performance KPIs',
            'Coordinate with supplier',
            'File compliance documentation',
            'Update CRM records',
            'Review open work orders',
            'Calibrate shop floor equipment',
            'Prepare employee attendance sheet',
          ];
          const titleIdx = Math.floor(seededRand((seed ^ (t + 7)) * 99991) * titles.length);
          taskInserts.push({
            employeeId: emp.id,
            title: titles[titleIdx],
            status: TaskStatus.COMPLETED,
            priority: priorities[pIdx],
            completedAt: date,
            createdAt: new Date(date.getTime() - 86400000 * Math.ceil(r1 * 5 + 1)),
            updatedAt: date,
          });
        }
      }
    }

    // Upsert attendance in batches
    for (const record of attendanceUpserts) {
      await prisma.attendance.upsert({
        where: { employeeId_date: { employeeId: record.employeeId, date: record.date } },
        create: record,
        update: { status: record.status, workHours: record.workHours, markedBy: record.markedBy },
      });
    }
    totalAttendance += attendanceUpserts.length;

    // Insert tasks (skip duplicate-title on same day via createMany skipDuplicates)
    if (taskInserts.length > 0) {
      await prisma.employeeTask.createMany({
        data: taskInserts,
        skipDuplicates: true,
      });
      totalTasks += taskInserts.length;
    }

    console.log(
      `   ✓ ${emp.employeeCode} ${emp.firstName} ${emp.lastName} — ` +
      `rank=${ranking}, attendance_rate=${(attendanceRate(ranking) * 100).toFixed(0)}%, ` +
      `attendance=${attendanceUpserts.filter(a => a.status === 'PRESENT' || a.status === 'HALF_DAY').length} present days, ` +
      `tasks_completed=${taskInserts.length}`
    );
  }

  console.log(`\n✅ Done. Seeded ${totalAttendance} attendance records & ${totalTasks} completed tasks.`);
  await prisma.$disconnect();
}

seedActivityHeatmap().catch((e) => {
  console.error(e);
  process.exit(1);
});
