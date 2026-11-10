import { TaskPriority, TaskStatus, AttendanceStatus } from '@prisma/client';

export type ScoreConfidence = 'SUFFICIENT_EVIDENCE' | 'PROVISIONAL' | 'INSUFFICIENT_DATA' | 'NOT_APPLICABLE';

export type PerformanceGrade = 'A+' | 'A' | 'B' | 'C' | 'D';
export type VelocityRating = 'FAST' | 'OPTIMAL' | 'MODERATE' | 'SLOW';

export interface ScoringWeights {
  taskOutcomes: number;   // default 20
  workQuality: number;    // default 20
  deliveryReliability: number; // default 20
  attendanceReliability: number; // default 20
  productivity: number;   // default 10
  roleGoals: number;      // default 10
}

export interface ScoringPolicyConfig {
  version: number;
  name: string;
  weights: ScoringWeights;
  rollingWindowDays: number;
  minEvidenceTasks: number;
  minEvidenceAttendances: number;
  minEvidenceReviewedTasks: number;
  minEvidenceGoals: number;
  provisionalPolicy: 'NEUTRAL_PRIOR' | 'RENORMALIZE';
  provisionalNeutralScore: number;
  expectedWorkUnitsPerDay: number;
  priorityWeights: Record<TaskPriority, number>;
}

export const DEFAULT_SCORING_POLICY: ScoringPolicyConfig = {
  version: 2,
  name: 'BALANCED_COMPREHENSIVE_POLICY_V2',
  weights: {
    taskOutcomes: 20,
    workQuality: 20,
    deliveryReliability: 20,
    attendanceReliability: 20,
    productivity: 10,
    roleGoals: 10
  },
  rollingWindowDays: 90,
  minEvidenceTasks: 3,
  minEvidenceAttendances: 10,
  minEvidenceReviewedTasks: 2,
  minEvidenceGoals: 1,
  provisionalPolicy: 'NEUTRAL_PRIOR',
  provisionalNeutralScore: 70.0,
  expectedWorkUnitsPerDay: 0.5, // 0.5 weighted units per scheduled day (~1 medium task every 2 days)
  priorityWeights: {
    LOW: 0.5,
    MEDIUM: 1.0,
    HIGH: 1.5,
    URGENT: 2.0
  }
};

export interface TaskRecord {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  employeeId: string;
  dueDate: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date | null;
  validatedBy?: string | null;
  validationNotes?: string | null;
  proofUrl?: string | null;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: Date;
  status: AttendanceStatus;
  workHours?: number | null;
}

export interface GoalRecord {
  id: string;
  title: string;
  weight: number;
  targetValue: number;
  achievedValue: number;
  unit: string;
  status: string;
  targetDate: Date;
  startDate: Date;
}

export interface ComponentCalculationResult {
  score: number; // 0 - 100
  effectiveWeight: number; // e.g. 30
  confidenceStatus: ScoreConfidence;
  evidenceCount: number;
  missingEvidenceReason?: string;
  metrics: Record<string, unknown>;
}

export interface DeterministicEvaluationResult {
  overallScore: number; // 0 - 100
  grade: PerformanceGrade;
  confidenceStatus: ScoreConfidence;
  velocityRating: VelocityRating;
  weights: ScoringWeights;
  components: {
    taskOutcomes: ComponentCalculationResult;
    workQuality: ComponentCalculationResult;
    deliveryReliability: ComponentCalculationResult;
    productivity: ComponentCalculationResult;
    roleGoals: ComponentCalculationResult;
    attendanceReliability: ComponentCalculationResult;
  };
  diagnostics: {
    totalTasks: number;
    completedTasks: number;
    remainingTasks: number;
    taskCompletionRate: number;
    onTimeCompletedTasks: number;
    onTimeDeliveryRate: number;
    averageCompletionHours: number | null;
    attendanceDaysPresent: number;
    attendanceDaysTotal: number;
    attendanceRate: number;
    averageWorkHoursPerDay: number | null;
    ranking: number;
  };
  policyVersion: number;
  scoringPeriod: {
    start: string;
    end: string;
  };
}

export class DeterministicScoringEngine {
  private policy: ScoringPolicyConfig;

  constructor(customPolicy: Partial<ScoringPolicyConfig> = {}) {
    this.policy = {
      ...DEFAULT_SCORING_POLICY,
      ...customPolicy,
      weights: {
        ...DEFAULT_SCORING_POLICY.weights,
        ...(customPolicy.weights || {})
      },
      priorityWeights: {
        ...DEFAULT_SCORING_POLICY.priorityWeights,
        ...(customPolicy.priorityWeights || {})
      }
    };

    this.validateWeights(this.policy.weights);
  }

  public validateWeights(weights: ScoringWeights): void {
    const values = Object.values(weights);
    for (const v of values) {
      if (typeof v !== 'number' || isNaN(v) || v < 0) {
        throw new Error(`Invalid scoring weight: weights must be non-negative numbers.`);
      }
    }
    const sum = Math.round(values.reduce((acc, curr) => acc + curr, 0) * 1000) / 1000;
    if (Math.abs(sum - 100) > 0.001) {
      throw new Error(`Scoring weights must sum to exactly 100%. Got ${sum}%.`);
    }
  }

  public getPolicy(): ScoringPolicyConfig {
    return this.policy;
  }

  public calculateGrade(
    score: number,
    confidence: ScoreConfidence,
    attendanceScore?: number
  ): PerformanceGrade {
    if (confidence === 'INSUFFICIENT_DATA') {
      // Missing data does not receive authoritative high grade
      return 'C';
    }
    const rounded = Math.round(score * 100) / 100;

    let grade: PerformanceGrade = 'D';
    if (rounded >= 90) grade = 'A+';
    else if (rounded >= 80) grade = 'A';
    else if (rounded >= 70) grade = 'B';
    else if (rounded >= 60) grade = 'C';
    else grade = 'D';

    // Disciplinary & Operational Guardrail: Attendance below threshold caps ceiling grade
    if (attendanceScore !== undefined) {
      if (attendanceScore < 50) {
        // Less than 50% attendance cannot receive higher than Grade C
        if (grade === 'A+' || grade === 'A' || grade === 'B') {
          grade = 'C';
        }
      } else if (attendanceScore < 70) {
        // Less than 70% attendance cannot receive Grade A+ or A
        if (grade === 'A+' || grade === 'A') {
          grade = 'B';
        }
      }
    }

    return grade;
  }

  public calculateVelocityRating(hours: number | null, onTimeRate: number): VelocityRating {
    if (hours === null) {
      return onTimeRate >= 85 ? 'OPTIMAL' : 'MODERATE';
    }
    if (hours <= 12 && onTimeRate >= 80) return 'FAST';
    if (hours <= 36 && onTimeRate >= 70) return 'OPTIMAL';
    if (hours <= 72) return 'MODERATE';
    return 'SLOW';
  }

  /**
   * Component 1: Task Outcomes (30%)
   * Formula: taskOutcomeScore = 100 * sum(taskWeight * completionValue) / sum(taskWeight)
   */
  public calculateTaskOutcomeScore(
    tasks: TaskRecord[],
    periodStart: Date,
    periodEnd: Date
  ): ComponentCalculationResult {
    // Filter eligible tasks: assigned, within rolling window, exclude CANCELLED
    const eligibleTasks = tasks.filter((t) => {
      const created = new Date(t.createdAt);
      if (t.status === TaskStatus.CANCELLED) return false;
      return created >= periodStart && created <= periodEnd;
    });

    if (eligibleTasks.length === 0) {
      return {
        score: this.policy.provisionalNeutralScore,
        effectiveWeight: this.policy.weights.taskOutcomes,
        confidenceStatus: 'INSUFFICIENT_DATA',
        evidenceCount: 0,
        missingEvidenceReason: 'No assigned eligible tasks within the scoring window.',
        metrics: {
          eligibleCount: 0,
          completedCount: 0,
          weightedSumCompleted: 0,
          weightedSumTotal: 0,
          completionRate: 0
        }
      };
    }

    let weightedTotal = 0;
    let weightedCompleted = 0;
    let completedCount = 0;

    for (const t of eligibleTasks) {
      const weight = this.policy.priorityWeights[t.priority] || 1.0;
      weightedTotal += weight;
      if (t.status === TaskStatus.COMPLETED) {
        weightedCompleted += weight;
        completedCount++;
      }
    }

    const rawScore = weightedTotal > 0 ? (weightedCompleted / weightedTotal) * 100 : 0;
    const clampedScore = Math.min(100, Math.max(0, Math.round(rawScore * 100) / 100));

    const confidenceStatus: ScoreConfidence =
      eligibleTasks.length >= this.policy.minEvidenceTasks
        ? 'SUFFICIENT_EVIDENCE'
        : 'PROVISIONAL';

    return {
      score: clampedScore,
      effectiveWeight: this.policy.weights.taskOutcomes,
      confidenceStatus,
      evidenceCount: eligibleTasks.length,
      missingEvidenceReason:
        confidenceStatus === 'PROVISIONAL'
          ? `Low task sample size (${eligibleTasks.length}/${this.policy.minEvidenceTasks} min).`
          : undefined,
      metrics: {
        eligibleCount: eligibleTasks.length,
        completedCount,
        weightedSumCompleted: Math.round(weightedCompleted * 100) / 100,
        weightedSumTotal: Math.round(weightedTotal * 100) / 100,
        completionRate: Math.round((completedCount / eligibleTasks.length) * 100)
      }
    };
  }

  /**
   * Component 2: Work Quality (25%)
   * Formula: qualityScore = 100 * sum(firstPassAcceptedWeight) / sum(eligibleReviewedWorkWeight)
   */
  public calculateWorkQualityScore(
    tasks: TaskRecord[],
    periodStart: Date,
    periodEnd: Date
  ): ComponentCalculationResult {
    // Tasks that reached a definitive quality review outcome (COMPLETED with validation, or REJECTED)
    const reviewedTasks = tasks.filter((t) => {
      const created = new Date(t.createdAt);
      if (created < periodStart || created > periodEnd) return false;
      if (t.status === TaskStatus.CANCELLED) return false;

      // Completed tasks, or explicitly rejected tasks, or tasks submitted with validation notes
      return (
        t.status === TaskStatus.COMPLETED ||
        t.status === TaskStatus.REJECTED ||
        Boolean(t.validatedBy) ||
        Boolean(t.proofUrl)
      );
    });

    if (reviewedTasks.length === 0) {
      return {
        score: this.policy.provisionalNeutralScore,
        effectiveWeight: this.policy.weights.workQuality,
        confidenceStatus: 'INSUFFICIENT_DATA',
        evidenceCount: 0,
        missingEvidenceReason: 'No reviewed tasks or quality audit records in this window.',
        metrics: {
          reviewedCount: 0,
          acceptedWeight: 0,
          totalReviewedWeight: 0,
          rejectionRate: 0
        }
      };
    }

    let totalReviewedWeight = 0;
    let acceptedWeight = 0;
    let rejectedCount = 0;

    for (const t of reviewedTasks) {
      const weight = this.policy.priorityWeights[t.priority] || 1.0;
      totalReviewedWeight += weight;

      if (t.status === TaskStatus.REJECTED) {
        rejectedCount++;
      } else if (t.status === TaskStatus.COMPLETED) {
        acceptedWeight += weight;
      }
    }

    const rawScore = totalReviewedWeight > 0 ? (acceptedWeight / totalReviewedWeight) * 100 : 70;
    const clampedScore = Math.min(100, Math.max(0, Math.round(rawScore * 100) / 100));

    const confidenceStatus: ScoreConfidence =
      reviewedTasks.length >= this.policy.minEvidenceReviewedTasks
        ? 'SUFFICIENT_EVIDENCE'
        : 'PROVISIONAL';

    return {
      score: clampedScore,
      effectiveWeight: this.policy.weights.workQuality,
      confidenceStatus,
      evidenceCount: reviewedTasks.length,
      missingEvidenceReason:
        confidenceStatus === 'PROVISIONAL'
          ? `Limited reviewed submissions (${reviewedTasks.length}/${this.policy.minEvidenceReviewedTasks} min).`
          : undefined,
      metrics: {
        reviewedCount: reviewedTasks.length,
        acceptedWeight: Math.round(acceptedWeight * 100) / 100,
        totalReviewedWeight: Math.round(totalReviewedWeight * 100) / 100,
        rejectedCount
      }
    };
  }

  /**
   * Component 3: Delivery Reliability (20%)
   * Formula: deliveryScore = 100 * onTimeEligibleCommitments / eligibleCompletedCommitments
   */
  public calculateDeliveryReliabilityScore(
    tasks: TaskRecord[],
    periodStart: Date,
    periodEnd: Date
  ): ComponentCalculationResult {
    // Only completed commitments with an approved dueDate (or without due date, on-time by default)
    const completedTasks = tasks.filter((t) => {
      const created = new Date(t.createdAt);
      if (t.status !== TaskStatus.COMPLETED) return false;
      return created >= periodStart && created <= periodEnd;
    });

    if (completedTasks.length === 0) {
      return {
        score: this.policy.provisionalNeutralScore,
        effectiveWeight: this.policy.weights.deliveryReliability,
        confidenceStatus: 'INSUFFICIENT_DATA',
        evidenceCount: 0,
        missingEvidenceReason: 'No completed tasks available to evaluate delivery commitments.',
        metrics: {
          eligibleCommitments: 0,
          onTimeCount: 0,
          lateCount: 0,
          onTimeRate: 0
        }
      };
    }

    let onTimeCount = 0;
    let lateCount = 0;

    for (const t of completedTasks) {
      if (!t.dueDate) {
        onTimeCount++;
      } else {
        const due = new Date(t.dueDate).getTime();
        const finish = t.completedAt ? new Date(t.completedAt).getTime() : new Date(t.updatedAt).getTime();
        if (finish <= due) {
          onTimeCount++;
        } else {
          lateCount++;
        }
      }
    }

    const rawScore = (onTimeCount / completedTasks.length) * 100;
    const clampedScore = Math.min(100, Math.max(0, Math.round(rawScore * 100) / 100));

    const confidenceStatus: ScoreConfidence =
      completedTasks.length >= this.policy.minEvidenceTasks
        ? 'SUFFICIENT_EVIDENCE'
        : 'PROVISIONAL';

    return {
      score: clampedScore,
      effectiveWeight: this.policy.weights.deliveryReliability,
      confidenceStatus,
      evidenceCount: completedTasks.length,
      missingEvidenceReason:
        confidenceStatus === 'PROVISIONAL'
          ? `Sample size under minimum required commitments (${completedTasks.length}/${this.policy.minEvidenceTasks}).`
          : undefined,
      metrics: {
        eligibleCommitments: completedTasks.length,
        onTimeCount,
        lateCount,
        onTimeRate: Math.round((onTimeCount / completedTasks.length) * 100)
      }
    };
  }

  /**
   * Component 4: Complexity-Adjusted Productivity (10%)
   * Formula:
   * productivityRatio = completedWeightedWorkUnits / expectedWorkUnitsAtAvailableCapacity
   * productivityScore = 100 * min(1, max(0, productivityRatio))
   */
  public calculateProductivityScore(
    tasks: TaskRecord[],
    attendances: AttendanceRecord[],
    periodStart: Date,
    periodEnd: Date
  ): ComponentCalculationResult {
    // Compute available scheduled days (excluding approved leaves and holidays)
    const eligibleAttendances = attendances.filter((a) => {
      const d = new Date(a.date);
      return d >= periodStart && d <= periodEnd;
    });

    const scheduledWorkingDays = eligibleAttendances.filter((a) => {
      return (
        a.status === AttendanceStatus.PRESENT ||
        a.status === AttendanceStatus.HALF_DAY ||
        a.status === AttendanceStatus.ABSENT
      );
    }).length;

    // Default working days if no attendance records available yet
    const effectiveWorkingDays = Math.max(1, scheduledWorkingDays || 20);

    const completedTasks = tasks.filter((t) => {
      const created = new Date(t.createdAt);
      return t.status === TaskStatus.COMPLETED && created >= periodStart && created <= periodEnd;
    });

    let completedWeightedUnits = 0;
    for (const t of completedTasks) {
      completedWeightedUnits += this.policy.priorityWeights[t.priority] || 1.0;
    }

    const expectedUnits = effectiveWorkingDays * this.policy.expectedWorkUnitsPerDay;
    const ratio = expectedUnits > 0 ? completedWeightedUnits / expectedUnits : 0.8;
    const score = Math.min(100, Math.max(0, Math.round(ratio * 100 * 100) / 100));

    const confidenceStatus: ScoreConfidence =
      effectiveWorkingDays >= 5 && completedTasks.length >= 1
        ? 'SUFFICIENT_EVIDENCE'
        : 'PROVISIONAL';

    return {
      score,
      effectiveWeight: this.policy.weights.productivity,
      confidenceStatus,
      evidenceCount: completedTasks.length,
      missingEvidenceReason:
        confidenceStatus === 'PROVISIONAL'
          ? `Insufficient capacity baseline records (${completedTasks.length} tasks over ${effectiveWorkingDays} days).`
          : undefined,
      metrics: {
        completedWeightedUnits: Math.round(completedWeightedUnits * 100) / 100,
        expectedUnits: Math.round(expectedUnits * 100) / 100,
        productivityRatio: Math.round(ratio * 100) / 100,
        scheduledWorkingDays: effectiveWorkingDays
      }
    };
  }

  /**
   * Component 5: Role-Specific Goals (10%)
   * Formula: roleGoalScore = weighted average of eligible goal achievement percentages
   */
  public calculateRoleGoalsScore(
    goals: GoalRecord[],
    periodStart: Date,
    periodEnd: Date
  ): ComponentCalculationResult {
    const eligibleGoals = goals.filter((g) => {
      const target = new Date(g.targetDate);
      if (g.status === 'CANCELLED') return false;
      return target >= periodStart && target <= periodEnd;
    });

    if (eligibleGoals.length === 0) {
      return {
        score: this.policy.provisionalNeutralScore,
        effectiveWeight: this.policy.weights.roleGoals,
        confidenceStatus: 'INSUFFICIENT_DATA',
        evidenceCount: 0,
        missingEvidenceReason: 'No role-specific goals registered for this scoring window.',
        metrics: {
          goalCount: 0,
          averageAchievementRate: 0
        }
      };
    }

    let totalWeight = 0;
    let weightedAchievementSum = 0;

    for (const g of eligibleGoals) {
      const w = g.weight > 0 ? g.weight : 1.0;
      totalWeight += w;

      const achievementRatio = g.targetValue > 0 ? Math.min(1.2, Math.max(0, g.achievedValue / g.targetValue)) : 0.7;
      weightedAchievementSum += w * (achievementRatio * 100);
    }

    const rawScore = totalWeight > 0 ? weightedAchievementSum / totalWeight : 70;
    const clampedScore = Math.min(100, Math.max(0, Math.round(rawScore * 100) / 100));

    const confidenceStatus: ScoreConfidence =
      eligibleGoals.length >= this.policy.minEvidenceGoals
        ? 'SUFFICIENT_EVIDENCE'
        : 'PROVISIONAL';

    return {
      score: clampedScore,
      effectiveWeight: this.policy.weights.roleGoals,
      confidenceStatus,
      evidenceCount: eligibleGoals.length,
      metrics: {
        goalCount: eligibleGoals.length,
        averageAchievementRate: Math.round(clampedScore)
      }
    };
  }

  /**
   * Component 6: Attendance Reliability (5%)
   * Formula: attendanceScore = 100 * qualifyingAttendedDays / qualifyingScheduledDays
   */
  public calculateAttendanceReliabilityScore(
    attendances: AttendanceRecord[],
    periodStart: Date,
    periodEnd: Date
  ): ComponentCalculationResult {
    const eligible = attendances.filter((a) => {
      const d = new Date(a.date);
      return d >= periodStart && d <= periodEnd;
    });

    if (eligible.length === 0) {
      return {
        score: this.policy.provisionalNeutralScore,
        effectiveWeight: this.policy.weights.attendanceReliability,
        confidenceStatus: 'INSUFFICIENT_DATA',
        evidenceCount: 0,
        missingEvidenceReason: 'No attendance records logged in the scoring window.',
        metrics: {
          qualifyingScheduledDays: 0,
          qualifyingAttendedDays: 0,
          attendanceRate: 0
        }
      };
    }

    let qualifyingAttendedDays = 0;
    let qualifyingScheduledDays = 0;

    for (const a of eligible) {
      // Exclude approved leaves and holidays from the denominator as legitimate exceptions
      if (
        a.status === AttendanceStatus.LEAVE_PAID ||
        a.status === AttendanceStatus.LEAVE_CASUAL ||
        a.status === AttendanceStatus.LEAVE_SICK ||
        a.status === AttendanceStatus.HOLIDAY
      ) {
        continue;
      }

      qualifyingScheduledDays++;

      if (a.status === AttendanceStatus.PRESENT) {
        qualifyingAttendedDays += 1.0;
      } else if (a.status === AttendanceStatus.HALF_DAY) {
        qualifyingAttendedDays += 0.5;
      }
    }

    if (qualifyingScheduledDays === 0) {
      // All days were approved leave or holidays
      return {
        score: 100,
        effectiveWeight: this.policy.weights.attendanceReliability,
        confidenceStatus: 'SUFFICIENT_EVIDENCE',
        evidenceCount: eligible.length,
        metrics: {
          qualifyingScheduledDays: 0,
          qualifyingAttendedDays: 0,
          allDaysApprovedLeaveOrHoliday: true,
          attendanceRate: 100
        }
      };
    }

    const rawScore = (qualifyingAttendedDays / qualifyingScheduledDays) * 100;
    const clampedScore = Math.min(100, Math.max(0, Math.round(rawScore * 100) / 100));

    const confidenceStatus: ScoreConfidence =
      qualifyingScheduledDays >= this.policy.minEvidenceAttendances
        ? 'SUFFICIENT_EVIDENCE'
        : 'PROVISIONAL';

    return {
      score: clampedScore,
      effectiveWeight: this.policy.weights.attendanceReliability,
      confidenceStatus,
      evidenceCount: qualifyingScheduledDays,
      missingEvidenceReason:
        confidenceStatus === 'PROVISIONAL'
          ? `Sample size under minimum observation days (${qualifyingScheduledDays}/${this.policy.minEvidenceAttendances}).`
          : undefined,
      metrics: {
        qualifyingScheduledDays,
        qualifyingAttendedDays,
        attendanceRate: Math.round((qualifyingAttendedDays / qualifyingScheduledDays) * 100)
      }
    };
  }

  /**
   * Evaluates complete deterministic performance score for an employee
   */
  public evaluateEmployee(params: {
    tasks: TaskRecord[];
    attendances: AttendanceRecord[];
    goals?: GoalRecord[];
    ranking?: number;
    periodStart?: Date;
    periodEnd?: Date;
  }): DeterministicEvaluationResult {
    const end = params.periodEnd || new Date();
    const start =
      params.periodStart ||
      new Date(end.getTime() - this.policy.rollingWindowDays * 24 * 60 * 60 * 1000);

    const taskOutcomes = this.calculateTaskOutcomeScore(params.tasks, start, end);
    const workQuality = this.calculateWorkQualityScore(params.tasks, start, end);
    const deliveryReliability = this.calculateDeliveryReliabilityScore(params.tasks, start, end);
    const productivity = this.calculateProductivityScore(params.tasks, params.attendances, start, end);
    const roleGoals = this.calculateRoleGoalsScore(params.goals || [], start, end);
    const attendanceReliability = this.calculateAttendanceReliabilityScore(params.attendances, start, end);

    // Calculate composite overall score strictly from all 6 authoritative components
    const w = this.policy.weights;
    const compositeRaw =
      (taskOutcomes.score * w.taskOutcomes +
        workQuality.score * w.workQuality +
        deliveryReliability.score * w.deliveryReliability +
        attendanceReliability.score * w.attendanceReliability +
        productivity.score * w.productivity +
        roleGoals.score * w.roleGoals) /
      100;

    let computedScore = compositeRaw;

    // Operational Integrity Guardrail: Severe absenteeism (< 50%) caps overall performance score
    // An employee who is absent for more than half their scheduled days cannot score above 69 (Grade C max)
    if (attendanceReliability.confidenceStatus !== 'INSUFFICIENT_DATA' && attendanceReliability.score < 50) {
      const attendanceCap = Math.max(0, 45 + (attendanceReliability.score / 50) * 24); // Scales 45 to 69
      computedScore = Math.min(computedScore, attendanceCap);
    } else if (attendanceReliability.confidenceStatus !== 'INSUFFICIENT_DATA' && attendanceReliability.score < 70) {
      // Sub-70% attendance caps overall score at 79 (Grade B max)
      const attendanceCap = Math.max(0, 69 + ((attendanceReliability.score - 50) / 20) * 10); // Scales 69 to 79
      computedScore = Math.min(computedScore, attendanceCap);
    }

    const overallScore = Math.min(100, Math.max(0, Math.round(computedScore * 100) / 100));
    // Determine aggregate confidence state
    const componentConfidences = [
      taskOutcomes.confidenceStatus,
      workQuality.confidenceStatus,
      deliveryReliability.confidenceStatus,
      productivity.confidenceStatus,
      attendanceReliability.confidenceStatus
    ];

    let overallConfidence: ScoreConfidence = 'SUFFICIENT_EVIDENCE';
    if (componentConfidences.filter((c) => c === 'INSUFFICIENT_DATA').length >= 2) {
      overallConfidence = 'INSUFFICIENT_DATA';
    } else if (componentConfidences.some((c) => c === 'PROVISIONAL' || c === 'INSUFFICIENT_DATA')) {
      overallConfidence = 'PROVISIONAL';
    }

    const grade = this.calculateGrade(overallScore, overallConfidence, attendanceReliability.score);

    // Compute diagnostics
    const completedTasksList = params.tasks.filter((t) => t.status === TaskStatus.COMPLETED);
    let totalCompletionHours = 0;
    let onTimeCompletedTasks = 0;

    completedTasksList.forEach((t) => {
      const s = new Date(t.createdAt).getTime();
      const f = (t.completedAt ? new Date(t.completedAt) : new Date(t.updatedAt)).getTime();
      totalCompletionHours += Math.max(0.5, (f - s) / (1000 * 60 * 60));

      if (!t.dueDate || f <= new Date(t.dueDate).getTime()) {
        onTimeCompletedTasks += 1;
      }
    });

    const averageCompletionHours =
      completedTasksList.length > 0
        ? Number((totalCompletionHours / completedTasksList.length).toFixed(1))
        : null;

    const onTimeDeliveryRate =
      completedTasksList.length > 0
        ? Math.round((onTimeCompletedTasks / completedTasksList.length) * 100)
        : 100;

    const velocityRating = this.calculateVelocityRating(averageCompletionHours, onTimeDeliveryRate);

    const attendances = params.attendances || [];
    const presentRecords = attendances.filter(
      (a) => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.HALF_DAY
    );
    const totalWorkHours = presentRecords.reduce(
      (sum, a) => sum + (a.workHours ? Number(a.workHours) : 8),
      0
    );
    const averageWorkHoursPerDay =
      presentRecords.length > 0 ? Number((totalWorkHours / presentRecords.length).toFixed(1)) : 8.0;

    return {
      overallScore,
      grade,
      confidenceStatus: overallConfidence,
      velocityRating,
      weights: this.policy.weights,
      components: {
        taskOutcomes,
        workQuality,
        deliveryReliability,
        productivity,
        roleGoals,
        attendanceReliability
      },
      diagnostics: {
        totalTasks: params.tasks.length,
        completedTasks: completedTasksList.length,
        remainingTasks: Math.max(0, params.tasks.length - completedTasksList.length),
        taskCompletionRate:
          params.tasks.length > 0
            ? Math.round((completedTasksList.length / params.tasks.length) * 100)
            : 100,
        onTimeCompletedTasks,
        onTimeDeliveryRate,
        averageCompletionHours,
        attendanceDaysPresent: presentRecords.length,
        attendanceDaysTotal: attendances.length,
        attendanceRate:
          attendances.length > 0
            ? Math.round((presentRecords.length / attendances.length) * 100)
            : 90,
        averageWorkHoursPerDay,
        ranking: params.ranking || 1
      },
      policyVersion: this.policy.version,
      scoringPeriod: {
        start: start.toISOString(),
        end: end.toISOString()
      }
    };
  }
}
