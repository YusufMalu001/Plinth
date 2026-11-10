import {
  DeterministicScoringEngine,
  TaskRecord,
  AttendanceRecord,
  GoalRecord
} from '../deterministic-scoring-engine.service';
import { TaskStatus, TaskPriority, AttendanceStatus } from '@prisma/client';

describe('Employee Performance Scoring Engine 2.0 - Deterministic Engine', () => {
  const periodStart = new Date('2026-07-01T00:00:00Z');
  const periodEnd = new Date('2026-10-01T00:00:00Z');

  describe('1. Formula, Weights & Composite Bounds', () => {
    it('validates default weights sum to exactly 100%', () => {
      const engine = new DeterministicScoringEngine();
      const policy = engine.getPolicy();
      const sum =
        policy.weights.taskOutcomes +
        policy.weights.workQuality +
        policy.weights.deliveryReliability +
        policy.weights.productivity +
        policy.weights.roleGoals +
        policy.weights.attendanceReliability;
      expect(sum).toBe(100);
      expect(policy.weights.taskOutcomes).toBe(20);
      expect(policy.weights.workQuality).toBe(20);
      expect(policy.weights.deliveryReliability).toBe(20);
      expect(policy.weights.attendanceReliability).toBe(20);
      expect(policy.weights.productivity).toBe(10);
      expect(policy.weights.roleGoals).toBe(10);
    });

    it('rejects invalid weights that do not sum to 100%', () => {
      expect(() => {
        new DeterministicScoringEngine({
          weights: {
            taskOutcomes: 40,
            workQuality: 20,
            deliveryReliability: 20,
            attendanceReliability: 20,
            productivity: 10,
            roleGoals: 10
          }
        });
      }).toThrow(/Scoring weights must sum to exactly 100%/);
    });

    it('rejects negative weights', () => {
      expect(() => {
        new DeterministicScoringEngine({
          weights: {
            taskOutcomes: -10,
            workQuality: 40,
            deliveryReliability: 20,
            attendanceReliability: 20,
            productivity: 15,
            roleGoals: 15
          }
        });
      }).toThrow(/weights must be non-negative/);
    });

    it('never allows overall score to exceed 100 or drop below 0', () => {
      const engine = new DeterministicScoringEngine();
      // Perfect case
      const perfectTasks: TaskRecord[] = [
        {
          id: 't1',
          title: 'T1',
          status: TaskStatus.COMPLETED,
          priority: TaskPriority.HIGH,
          employeeId: 'emp1',
          dueDate: new Date('2026-08-15T00:00:00Z'),
          completedAt: new Date('2026-08-10T00:00:00Z'),
          createdAt: new Date('2026-08-01T00:00:00Z'),
          updatedAt: new Date('2026-08-10T00:00:00Z'),
          validatedBy: 'reviewer1'
        },
        {
          id: 't2',
          title: 'T2',
          status: TaskStatus.COMPLETED,
          priority: TaskPriority.URGENT,
          employeeId: 'emp1',
          dueDate: new Date('2026-08-20T00:00:00Z'),
          completedAt: new Date('2026-08-18T00:00:00Z'),
          createdAt: new Date('2026-08-01T00:00:00Z'),
          updatedAt: new Date('2026-08-18T00:00:00Z'),
          validatedBy: 'reviewer1'
        },
        {
          id: 't3',
          title: 'T3',
          status: TaskStatus.COMPLETED,
          priority: TaskPriority.MEDIUM,
          employeeId: 'emp1',
          dueDate: new Date('2026-08-25T00:00:00Z'),
          completedAt: new Date('2026-08-22T00:00:00Z'),
          createdAt: new Date('2026-08-01T00:00:00Z'),
          updatedAt: new Date('2026-08-22T00:00:00Z'),
          validatedBy: 'reviewer1'
        }
      ];

      const perfectAttendances: AttendanceRecord[] = Array.from({ length: 25 }, (_, i) => ({
        id: `att-${i}`,
        employeeId: 'emp1',
        date: new Date(`2026-08-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
        status: AttendanceStatus.PRESENT,
        workHours: 8.5
      }));

      const perfectGoals: GoalRecord[] = [
        {
          id: 'g1',
          title: 'Goal 1',
          weight: 1.0,
          targetValue: 100,
          achievedValue: 100,
          unit: '%',
          status: 'ACHIEVED',
          targetDate: new Date('2026-08-30T00:00:00Z'),
          startDate: new Date('2026-07-01T00:00:00Z')
        }
      ];

      const res = engine.evaluateEmployee({
        tasks: perfectTasks,
        attendances: perfectAttendances,
        goals: perfectGoals,
        periodStart,
        periodEnd
      });

      expect(res.overallScore).toBeLessThanOrEqual(100);
      expect(res.overallScore).toBeGreaterThanOrEqual(90);
      expect(res.grade).toBe('A+');
    });

    it('does not inflate scores with ranking bonus', () => {
      const engine = new DeterministicScoringEngine();
      const emptyResRank1 = engine.evaluateEmployee({
        tasks: [],
        attendances: [],
        ranking: 1,
        periodStart,
        periodEnd
      });

      const emptyResRank10 = engine.evaluateEmployee({
        tasks: [],
        attendances: [],
        ranking: 10,
        periodStart,
        periodEnd
      });

      // Pure ranking must NEVER change the underlying mathematical performance score
      expect(emptyResRank1.overallScore).toBe(emptyResRank10.overallScore);
      expect(emptyResRank1.diagnostics.ranking).toBe(1);
      expect(emptyResRank10.diagnostics.ranking).toBe(10);
    });
  });

  describe('2. Task Outcome Component', () => {
    const engine = new DeterministicScoringEngine();

    it('computes weighted completion with priority factors', () => {
      const tasks: TaskRecord[] = [
        // Completed URGENT (weight = 2.0)
        {
          id: 't1',
          title: 'T1',
          status: TaskStatus.COMPLETED,
          priority: TaskPriority.URGENT,
          employeeId: 'emp1',
          dueDate: null,
          completedAt: new Date('2026-07-10T00:00:00Z'),
          createdAt: new Date('2026-07-05T00:00:00Z'),
          updatedAt: new Date('2026-07-10T00:00:00Z')
        },
        // Incomplete LOW (weight = 0.5)
        {
          id: 't2',
          title: 'T2',
          status: TaskStatus.IN_PROGRESS,
          priority: TaskPriority.LOW,
          employeeId: 'emp1',
          dueDate: null,
          completedAt: null,
          createdAt: new Date('2026-07-05T00:00:00Z'),
          updatedAt: new Date('2026-07-10T00:00:00Z')
        },
        // Completed MEDIUM (weight = 1.0)
        {
          id: 't3',
          title: 'T3',
          status: TaskStatus.COMPLETED,
          priority: TaskPriority.MEDIUM,
          employeeId: 'emp1',
          dueDate: null,
          completedAt: new Date('2026-07-15T00:00:00Z'),
          createdAt: new Date('2026-07-05T00:00:00Z'),
          updatedAt: new Date('2026-07-15T00:00:00Z')
        }
      ];

      // Total weighted: 2.0 + 0.5 + 1.0 = 3.5
      // Completed weighted: 2.0 + 1.0 = 3.0
      // Expected score: (3.0 / 3.5) * 100 = 85.71
      const res = engine.calculateTaskOutcomeScore(tasks, periodStart, periodEnd);
      expect(res.score).toBe(85.71);
      expect(res.confidenceStatus).toBe('SUFFICIENT_EVIDENCE');
      expect(res.evidenceCount).toBe(3);
    });

    it('excludes CANCELLED tasks from task outcome denominator', () => {
      const tasks: TaskRecord[] = [
        {
          id: 't1',
          title: 'T1',
          status: TaskStatus.COMPLETED,
          priority: TaskPriority.MEDIUM,
          employeeId: 'emp1',
          dueDate: null,
          completedAt: new Date('2026-07-10T00:00:00Z'),
          createdAt: new Date('2026-07-05T00:00:00Z'),
          updatedAt: new Date('2026-07-10T00:00:00Z')
        },
        {
          id: 't2',
          title: 'T2',
          status: TaskStatus.CANCELLED,
          priority: TaskPriority.HIGH,
          employeeId: 'emp1',
          dueDate: null,
          completedAt: null,
          createdAt: new Date('2026-07-05T00:00:00Z'),
          updatedAt: new Date('2026-07-10T00:00:00Z')
        }
      ];

      const res = engine.calculateTaskOutcomeScore(tasks, periodStart, periodEnd);
      expect(res.score).toBe(100);
      expect(res.evidenceCount).toBe(1);
      expect(res.confidenceStatus).toBe('PROVISIONAL'); // 1 task < minEvidenceTasks (3)
    });
  });

  describe('3. Work Quality Component', () => {
    const engine = new DeterministicScoringEngine();

    it('calculates quality score from first-pass acceptance vs rejected tasks', () => {
      const tasks: TaskRecord[] = [
        {
          id: 'q1',
          title: 'Q1',
          status: TaskStatus.COMPLETED,
          priority: TaskPriority.MEDIUM,
          employeeId: 'emp1',
          dueDate: null,
          completedAt: new Date('2026-07-10T00:00:00Z'),
          createdAt: new Date('2026-07-05T00:00:00Z'),
          updatedAt: new Date('2026-07-10T00:00:00Z')
        },
        {
          id: 'q2',
          title: 'Q2',
          status: TaskStatus.REJECTED,
          priority: TaskPriority.MEDIUM,
          employeeId: 'emp1',
          dueDate: null,
          completedAt: null,
          createdAt: new Date('2026-07-05T00:00:00Z'),
          updatedAt: new Date('2026-07-10T00:00:00Z')
        }
      ];

      // 1 accepted (1.0), 1 rejected (1.0) -> 50%
      const res = engine.calculateWorkQualityScore(tasks, periodStart, periodEnd);
      expect(res.score).toBe(50);
      expect(res.evidenceCount).toBe(2);
      expect(res.confidenceStatus).toBe('SUFFICIENT_EVIDENCE');
    });

    it('returns INSUFFICIENT_DATA and neutral score if no quality reviews exist', () => {
      const res = engine.calculateWorkQualityScore([], periodStart, periodEnd);
      expect(res.confidenceStatus).toBe('INSUFFICIENT_DATA');
      expect(res.score).toBe(70);
    });
  });

  describe('4. Delivery Reliability Component', () => {
    const engine = new DeterministicScoringEngine();

    it('calculates exact on-time rate against authorized due dates', () => {
      const tasks: TaskRecord[] = [
        // On-time
        {
          id: 'd1',
          title: 'D1',
          status: TaskStatus.COMPLETED,
          priority: TaskPriority.MEDIUM,
          employeeId: 'emp1',
          dueDate: new Date('2026-07-20T00:00:00Z'),
          completedAt: new Date('2026-07-18T00:00:00Z'),
          createdAt: new Date('2026-07-01T00:00:00Z'),
          updatedAt: new Date('2026-07-18T00:00:00Z')
        },
        // Late
        {
          id: 'd2',
          title: 'D2',
          status: TaskStatus.COMPLETED,
          priority: TaskPriority.MEDIUM,
          employeeId: 'emp1',
          dueDate: new Date('2026-07-20T00:00:00Z'),
          completedAt: new Date('2026-07-25T00:00:00Z'),
          createdAt: new Date('2026-07-01T00:00:00Z'),
          updatedAt: new Date('2026-07-25T00:00:00Z')
        },
        // On-time (no due date set)
        {
          id: 'd3',
          title: 'D3',
          status: TaskStatus.COMPLETED,
          priority: TaskPriority.MEDIUM,
          employeeId: 'emp1',
          dueDate: null,
          completedAt: new Date('2026-07-15T00:00:00Z'),
          createdAt: new Date('2026-07-01T00:00:00Z'),
          updatedAt: new Date('2026-07-15T00:00:00Z')
        }
      ];

      // 2 on-time out of 3 completed commitments = 66.67%
      const res = engine.calculateDeliveryReliabilityScore(tasks, periodStart, periodEnd);
      expect(res.score).toBe(66.67);
      expect(res.confidenceStatus).toBe('SUFFICIENT_EVIDENCE');
      expect(res.evidenceCount).toBe(3);
    });
  });

  describe('5. Productivity Component', () => {
    const engine = new DeterministicScoringEngine();

    it('evaluates weighted output against scheduled working days capacity', () => {
      const attendances: AttendanceRecord[] = Array.from({ length: 20 }, (_, i) => ({
        id: `att-${i}`,
        employeeId: 'emp1',
        date: new Date(`2026-07-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
        status: AttendanceStatus.PRESENT
      }));

      // 20 days * 0.5 units/day = 10 expected work units
      // Completed tasks: 5 medium tasks = 5.0 units
      // ratio: 5 / 10 = 0.5 -> 50%
      const tasks: TaskRecord[] = Array.from({ length: 5 }, (_, i) => ({
        id: `p-${i}`,
        title: `Task ${i}`,
        status: TaskStatus.COMPLETED,
        priority: TaskPriority.MEDIUM,
        employeeId: 'emp1',
        dueDate: null,
        completedAt: new Date('2026-07-10T00:00:00Z'),
        createdAt: new Date('2026-07-01T00:00:00Z'),
        updatedAt: new Date('2026-07-10T00:00:00Z')
      }));

      const res = engine.calculateProductivityScore(tasks, attendances, periodStart, periodEnd);
      expect(res.score).toBe(50);
      expect(res.confidenceStatus).toBe('SUFFICIENT_EVIDENCE');
    });
  });

  describe('6. Attendance Component', () => {
    const engine = new DeterministicScoringEngine();

    it('excludes approved leave and holidays from denominator', () => {
      const attendances: AttendanceRecord[] = [
        { id: '1', employeeId: 'emp1', date: new Date('2026-07-01'), status: AttendanceStatus.PRESENT },
        { id: '2', employeeId: 'emp1', date: new Date('2026-07-02'), status: AttendanceStatus.PRESENT },
        { id: '3', employeeId: 'emp1', date: new Date('2026-07-03'), status: AttendanceStatus.HALF_DAY },
        { id: '4', employeeId: 'emp1', date: new Date('2026-07-04'), status: AttendanceStatus.LEAVE_PAID }, // Excluded
        { id: '5', employeeId: 'emp1', date: new Date('2026-07-05'), status: AttendanceStatus.HOLIDAY },    // Excluded
        { id: '6', employeeId: 'emp1', date: new Date('2026-07-06'), status: AttendanceStatus.ABSENT }
      ];

      // Scheduled days: 4 (1, 2, 3, 6)
      // Attended: 1 + 1 + 0.5 + 0 = 2.5
      // Rate: (2.5 / 4) * 100 = 62.5%
      const res = engine.calculateAttendanceReliabilityScore(attendances, periodStart, periodEnd);
      expect(res.score).toBe(62.5);
    });

    it('caps ceiling grade and overall score when attendance is severely deficient (< 50%)', () => {
      // 10 scheduled days, only 4 attended (40% attendance)
      const attendances: AttendanceRecord[] = [
        ...Array.from({ length: 4 }, (_, i) => ({
          id: `att-${i}`,
          employeeId: 'emp1',
          date: new Date(`2026-07-0${i + 1}`),
          status: AttendanceStatus.PRESENT
        })),
        ...Array.from({ length: 6 }, (_, i) => ({
          id: `att-abs-${i}`,
          employeeId: 'emp1',
          date: new Date(`2026-07-1${i}`),
          status: AttendanceStatus.ABSENT
        }))
      ];

      // Even with 100% on tasks
      const perfectTasks: TaskRecord[] = [
        {
          id: 't1',
          title: 'T1',
          status: TaskStatus.COMPLETED,
          priority: TaskPriority.HIGH,
          employeeId: 'emp1',
          dueDate: null,
          completedAt: new Date('2026-07-10T00:00:00Z'),
          createdAt: new Date('2026-07-01T00:00:00Z'),
          updatedAt: new Date('2026-07-10T00:00:00Z'),
          validatedBy: 'Admin'
        },
        {
          id: 't2',
          title: 'T2',
          status: TaskStatus.COMPLETED,
          priority: TaskPriority.MEDIUM,
          employeeId: 'emp1',
          dueDate: null,
          completedAt: new Date('2026-07-11T00:00:00Z'),
          createdAt: new Date('2026-07-01T00:00:00Z'),
          updatedAt: new Date('2026-07-11T00:00:00Z'),
          validatedBy: 'Admin'
        },
        {
          id: 't3',
          title: 'T3',
          status: TaskStatus.COMPLETED,
          priority: TaskPriority.LOW,
          employeeId: 'emp1',
          dueDate: null,
          completedAt: new Date('2026-07-12T00:00:00Z'),
          createdAt: new Date('2026-07-01T00:00:00Z'),
          updatedAt: new Date('2026-07-12T00:00:00Z'),
          validatedBy: 'Admin'
        }
      ];

      const res = engine.evaluateEmployee({
        tasks: perfectTasks,
        attendances,
        periodStart,
        periodEnd
      });

      // Attendance score is 40%
      expect(res.components.attendanceReliability.score).toBe(40);
      // Overall score must be capped under 70 (cannot get Grade A or B with <50% attendance)
      expect(res.overallScore).toBeLessThanOrEqual(69);
      expect(['C', 'D']).toContain(res.grade);
    });
  });

  describe('7. Confidence and Insufficient Evidence Handling', () => {
    const engine = new DeterministicScoringEngine();

    it('marks employee with zero tasks or attendances as INSUFFICIENT_DATA and assigns non-authoritative grade', () => {
      const res = engine.evaluateEmployee({
        tasks: [],
        attendances: [],
        goals: [],
        periodStart,
        periodEnd
      });

      expect(res.confidenceStatus).toBe('INSUFFICIENT_DATA');
      expect(res.grade).toBe('C'); // Non-authoritative grade
    });
  });
});
