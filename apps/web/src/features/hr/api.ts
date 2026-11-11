import { apiClient } from '../../lib/api-client';
import { fetchApi } from '../api/client';
import {
  EmployeeDto,
  EmployeeTaskDto,
  AttendanceDto,
  PaySlipDto,
  EmployeeDocumentDto,
  WorkExperienceDto,
  OnboardingDetailsDto
} from '@plinth/types';

export interface EmployeeFilterParams {
  search?: string;
  departmentId?: string;
  gender?: string;
  minSalary?: string | number;
  maxSalary?: string | number;
  ranking?: string | number;
  hierarchyLevel?: string | number;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const hrApi = {
  // Directory & Employee details
  async getEmployees(params?: EmployeeFilterParams): Promise<EmployeeDto[]> {
    const stringParams: Record<string, string | undefined> = {};
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          stringParams[k] = String(v);
        }
      });
    }
    const response = await apiClient.get<unknown>('/employees', stringParams);
    const data = (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
    if (Array.isArray(data)) return data as EmployeeDto[];
    if (data && typeof data === 'object' && 'items' in data) {
      const items = data.items;
      if (Array.isArray(items)) return items as EmployeeDto[];
    }
    return [];
  },
  async getEmployeeById(id: string): Promise<EmployeeDto & {
    manager?: any;
    directReports?: any[];
    tasks?: EmployeeTaskDto[];
    attendances?: AttendanceDto[];
    paySlips?: PaySlipDto[];
    documents?: EmployeeDocumentDto[];
    workExperiences?: WorkExperienceDto[];
    onboardingDetails?: OnboardingDetailsDto | null;
    userAccounts?: Array<{
      id: string;
      email: string;
      role: string;
      isActive: boolean;
      onboardingCompleted: boolean;
      lastLoginAt?: string | null;
      mustChangePassword: boolean;
      initialPassword?: string | null;
      createdAt?: string;
      userRoles?: Array<{
        id: string;
        role: {
          id: string;
          name: string;
          description?: string | null;
          permissions?: Array<{
            permission: {
              id: string;
              action: string;
              resource: string;
              description?: string | null;
              key?: string;
            };
          }>;
        };
      }>;
    }>;
  }> {
    const response = await apiClient.get<unknown>(`/employees/${id}`);
    const data = (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
    return data as EmployeeDto & {
      manager?: unknown;
      directReports?: unknown[];
      tasks?: EmployeeTaskDto[];
      attendances?: AttendanceDto[];
      paySlips?: PaySlipDto[];
      documents?: EmployeeDocumentDto[];
      workExperiences?: WorkExperienceDto[];
      onboardingDetails?: OnboardingDetailsDto | null;
      userAccounts?: Array<{
        id: string;
        email: string;
        role: string;
        isActive: boolean;
        onboardingCompleted: boolean;
        lastLoginAt?: string | null;
        mustChangePassword: boolean;
        initialPassword?: string | null;
        createdAt?: string;
        userRoles?: Array<{
          id: string;
          role: {
            id: string;
            name: string;
            description?: string | null;
            permissions?: Array<{
              permission: {
                id: string;
                action: string;
                resource: string;
                description?: string | null;
                key?: string;
              };
            }>;
          };
        }>;
      }>;
    };
  },

  async createEmployee(data: Partial<EmployeeDto>): Promise<EmployeeDto> {
    const response = await apiClient.post<any>('/employees', data);
    return (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
  },

  async updateEmployee(id: string, data: Partial<EmployeeDto>): Promise<EmployeeDto> {
    const response = await fetchApi<any>(`/employees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
    return (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
  },

  // Onboarding & Credential creation by HR
  async inviteEmployee(data: {
    employeeId?: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    role?: string;
    departmentId?: string;
    designation?: string;
    ranking?: number;
    hierarchyLevel?: number;
    baseSalary?: number;
    gender?: string;
    tempPassword?: string;
    accessRoleKey?: string;
  }): Promise<{
    employee: EmployeeDto;
    user: { id: string; email: string; name?: string };
    tempPassword: string;
    accessRoleName?: string | null;
    onboardingToken: string;
    inviteLink: string;
  }> {
    const response = await apiClient.post<any>('/employees/invite', data);
    return (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
  },

  async resetEmployeePassword(employeeId: string, password?: string): Promise<{
    userId: string;
    email: string;
    tempPassword: string;
  }> {
    const response = await apiClient.post<any>(`/employees/${employeeId}/reset-password`, { password });
    return (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
  },

  async updateUserRole(userId: string, roleDefinitionId: string | null): Promise<any> {
    const response = await fetchApi<any>(`/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ roleDefinitionId }),
    });
    return (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
  },

  async getRoles(): Promise<Array<{ id: string; name: string; key?: string; description?: string; permissions?: Array<{ id: string; key?: string; name: string; action: string; resource: string }> }>> {
    const response = await fetchApi<any>('/roles');
    const roles = response?.data?.roles || response?.roles || response?.data || [];
    return Array.isArray(roles) ? roles : [];
  },
  async createRole(data: { key: string; name: string; description?: string; permissionIds: string[] }): Promise<any> {
    const response = await fetchApi<any>('/roles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
  },

  async updateRoleDefinition(id: string, data: { name?: string; description?: string | null; permissionIds?: string[] }): Promise<any> {
    const response = await fetchApi<any>(`/roles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
  },
  // Onboarding (Employee Side)
  async getOnboardingStatus(token?: string): Promise<{
    userId: string;
    email: string;
    onboardingCompleted: boolean;
    employee: (EmployeeDto & { documents?: EmployeeDocumentDto[]; workExperiences?: WorkExperienceDto[] }) | null;
    onboardingDetails: OnboardingDetailsDto | null;
  }> {
    const params = token ? { token } : undefined;
    const response = await apiClient.get<any>('/employees/onboarding/status', params);
    return (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
  },

  async completeOnboarding(data: {
    personalDetails: Record<string, unknown>;
    documents?: Array<{
      title: string;
      category: string;
      fileUrl: string;
      fileSize?: number;
      mimeType?: string;
    }>;
    workExperiences?: Array<{
      companyName: string;
      jobTitle: string;
      startDate: string;
      endDate?: string;
      isCurrent?: boolean;
      responsibilities?: string;
      location?: string;
    }>;
    agreements: {
      agreedToTerms: boolean;
      agreedToConductCode: boolean;
      agreedToNda: boolean;
      signatureText: string;
    };
  }, token?: string): Promise<{ success: boolean; message: string }> {
    const params = token ? `?token=${encodeURIComponent(token)}` : '';
    const response = await apiClient.post<any>(`/employees/onboarding/complete${params}`, { ...data, token });
    return (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
  },

  async updatePersonalDetails(data: Record<string, unknown>, token?: string): Promise<EmployeeDto> {
    const params = token ? `?token=${encodeURIComponent(token)}` : '';
    const response = await fetchApi<any>(`/employees/onboarding/personal-details${params}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...data, token })
    });
    return (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
  },
  // Tasks Queue APIs
  async getTasks(params?: {
    employeeId?: string;
    department?: string;
    status?: string;
    priority?: string;
    search?: string;
  }): Promise<EmployeeTaskDto[]> {
    const response = await apiClient.get<any>('/employees/tasks/queue', params);
    const data = (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
    return Array.isArray(data) ? data : [];
  },
  async createTask(data: Partial<EmployeeTaskDto>): Promise<EmployeeTaskDto> {
    const response = await apiClient.post<any>('/employees/tasks/queue', data);
    return (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
  },

  async getTaskById(id: string): Promise<EmployeeTaskDto | null> {
    const tasks = await this.getTasks();
    return tasks.find((t) => t.id === id) || null;
  },
  async updateTask(id: string, data: Partial<EmployeeTaskDto>): Promise<EmployeeTaskDto> {
    const response = await fetchApi<any>(`/employees/tasks/queue/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
    return (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
  },

  async deleteTask(id: string): Promise<void> {
    await apiClient.delete<any>(`/employees/tasks/queue/${id}`);
  },

  // Attendance APIs
  async getAttendance(employeeId: string, month?: number, year?: number): Promise<{
    records: AttendanceDto[];
    summary: {
      present: number;
      absent: number;
      leaveSick: number;
      leaveCasual: number;
      leavePaid: number;
      leaveUnpaid: number;
      halfDay: number;
      totalRecorded: number;
    };
  }> {
    const params: Record<string, string | undefined> = {};
    if (month) params.month = String(month);
    if (year) params.year = String(year);
    const response = await apiClient.get<any>(`/employees/${employeeId}/attendance`, params);
    const data = (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
    return data || {
      records: [],
      summary: { present: 0, absent: 0, leaveSick: 0, leaveCasual: 0, leavePaid: 0, leaveUnpaid: 0, halfDay: 0, totalRecorded: 0 }
    };
  },

  async markAttendance(data: {
    employeeId: string;
    date: string;
    status: string;
    checkIn?: string;
    checkOut?: string;
    workHours?: number;
    notes?: string;
  }): Promise<AttendanceDto> {
    const response = await apiClient.post<any>('/employees/attendance/mark', data);
    return (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
  },

  // Pay Slips APIs
  async getPaySlips(employeeId: string): Promise<PaySlipDto[]> {
    const response = await apiClient.get<any>(`/employees/${employeeId}/pay-slips`);
    const data = (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
    return Array.isArray(data) ? data : [];
  },

  async generatePaySlip(data: {
    employeeId: string;
    month: number;
    year: number;
    basicSalary: number;
    hra?: number;
    allowances?: number;
    bonus?: number;
    pfDeduction?: number;
    taxDeduction?: number;
    otherDeduction?: number;
    notes?: string;
  }): Promise<PaySlipDto> {
    const response = await apiClient.post<any>('/employees/pay-slips/generate', data);
    return (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
  },

  // Documents APIs
  async getDocuments(employeeId: string): Promise<EmployeeDocumentDto[]> {
    const response = await apiClient.get<any>(`/employees/${employeeId}/documents`);
    const data = (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
    return Array.isArray(data) ? data : [];
  },

  async uploadDocument(data: {
    employeeId: string;
    title: string;
    category: string;
    fileUrl: string;
    fileSize?: number;
    mimeType?: string;
  }): Promise<EmployeeDocumentDto> {
    const response = await apiClient.post<any>('/employees/documents/upload', data);
    return (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
  },

  async deleteDocument(id: string): Promise<void> {
    await apiClient.delete<unknown>(`/employees/documents/${id}`);
  },

  // Employee Scoring & Analytics Report (Engine 2.0)
  async getEmployeeAnalyticsReport(employeeId?: string): Promise<{
    generatedAt: string;
    provider: string;
    modelId: string;
    policyVersion?: number;
    scoringPeriod?: { start: string; end: string };
    workforceAverageScore: number;
    confidenceBreakdown?: {
      sufficientEvidenceCount: number;
      provisionalCount: number;
      insufficientDataCount: number;
    };
    executiveSummary: string;
    topPerformers: Array<{
      employeeId: string;
      score: number;
      grade: 'A+' | 'A' | 'B' | 'C' | 'D';
      confidenceStatus?: 'SUFFICIENT_EVIDENCE' | 'PROVISIONAL' | 'INSUFFICIENT_DATA' | 'NOT_APPLICABLE';
      velocityRating: 'FAST' | 'OPTIMAL' | 'MODERATE' | 'SLOW';
      componentScores?: {
        taskOutcomes: number;
        workQuality: number;
        deliveryReliability: number;
        productivity: number;
        roleGoals: number;
        attendanceReliability: number;
      };
      componentBreakdown?: Record<string, unknown>;
      attendanceScore: number;
      taskExecutionScore: number;
      speedScore: number;
      summary: string;
      strengths: string[];
      areasForImprovement: string[];
      recommendation: string;
      totalTasks?: number;
      completedTasks?: number;
      remainingTasks?: number;
      onTimeCompletedTasks?: number;
      onTimeDeliveryRate?: number;
      attendanceDaysPresent?: number;
      attendanceDaysTotal?: number;
      attendanceRate?: number;
      averageCompletionHours?: number | null;
      averageWorkHoursPerDay?: number | null;
      previousScore?: number;
      scoreChange?: number;
    }>;
    evaluations: Array<{
      employeeId: string;
      score: number;
      grade: 'A+' | 'A' | 'B' | 'C' | 'D';
      confidenceStatus?: 'SUFFICIENT_EVIDENCE' | 'PROVISIONAL' | 'INSUFFICIENT_DATA' | 'NOT_APPLICABLE';
      velocityRating: 'FAST' | 'OPTIMAL' | 'MODERATE' | 'SLOW';
      componentScores?: {
        taskOutcomes: number;
        workQuality: number;
        deliveryReliability: number;
        productivity: number;
        roleGoals: number;
        attendanceReliability: number;
      };
      componentBreakdown?: Record<string, unknown>;
      attendanceScore: number;
      taskExecutionScore: number;
      speedScore: number;
      summary: string;
      strengths: string[];
      areasForImprovement: string[];
      recommendation: string;
      totalTasks?: number;
      completedTasks?: number;
      remainingTasks?: number;
      onTimeCompletedTasks?: number;
      onTimeDeliveryRate?: number;
      attendanceDaysPresent?: number;
      attendanceDaysTotal?: number;
      attendanceRate?: number;
      averageCompletionHours?: number | null;
      averageWorkHoursPerDay?: number | null;
      previousScore?: number;
      scoreChange?: number;
    }>;
  }> {
    const params = employeeId ? { employeeId } : undefined;
    const response = await apiClient.get<unknown>('/employees/analytics/scoring', params);
    const data = (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
    return data as {
      generatedAt: string;
      provider: string;
      modelId: string;
      policyVersion?: number;
      scoringPeriod?: { start: string; end: string };
      workforceAverageScore: number;
      confidenceBreakdown?: {
        sufficientEvidenceCount: number;
        provisionalCount: number;
        insufficientDataCount: number;
      };
      executiveSummary: string;
      topPerformers: Array<{
        employeeId: string;
        score: number;
        grade: 'A+' | 'A' | 'B' | 'C' | 'D';
        confidenceStatus?: 'SUFFICIENT_EVIDENCE' | 'PROVISIONAL' | 'INSUFFICIENT_DATA' | 'NOT_APPLICABLE';
        velocityRating: 'FAST' | 'OPTIMAL' | 'MODERATE' | 'SLOW';
        componentScores?: {
          taskOutcomes: number;
          workQuality: number;
          deliveryReliability: number;
          productivity: number;
          roleGoals: number;
          attendanceReliability: number;
        };
        componentBreakdown?: Record<string, unknown>;
        attendanceScore: number;
        taskExecutionScore: number;
        speedScore: number;
        summary: string;
        strengths: string[];
        areasForImprovement: string[];
        recommendation: string;
        totalTasks?: number;
        completedTasks?: number;
        remainingTasks?: number;
        onTimeCompletedTasks?: number;
        onTimeDeliveryRate?: number;
        attendanceDaysPresent?: number;
        attendanceDaysTotal?: number;
        attendanceRate?: number;
        averageCompletionHours?: number | null;
        averageWorkHoursPerDay?: number | null;
        previousScore?: number;
        scoreChange?: number;
      }>;
      evaluations: Array<{
        employeeId: string;
        score: number;
        grade: 'A+' | 'A' | 'B' | 'C' | 'D';
        confidenceStatus?: 'SUFFICIENT_EVIDENCE' | 'PROVISIONAL' | 'INSUFFICIENT_DATA' | 'NOT_APPLICABLE';
        velocityRating: 'FAST' | 'OPTIMAL' | 'MODERATE' | 'SLOW';
        componentScores?: {
          taskOutcomes: number;
          workQuality: number;
          deliveryReliability: number;
          productivity: number;
          roleGoals: number;
          attendanceReliability: number;
        };
        componentBreakdown?: Record<string, unknown>;
        attendanceScore: number;
        taskExecutionScore: number;
        speedScore: number;
        summary: string;
        strengths: string[];
        areasForImprovement: string[];
        recommendation: string;
        totalTasks?: number;
        completedTasks?: number;
        remainingTasks?: number;
        onTimeCompletedTasks?: number;
        onTimeDeliveryRate?: number;
        attendanceDaysPresent?: number;
        attendanceDaysTotal?: number;
        attendanceRate?: number;
        averageCompletionHours?: number | null;
        averageWorkHoursPerDay?: number | null;
        previousScore?: number;
        scoreChange?: number;
      }>;
    };
  },

  async getEmployeeScoreHistory(employeeId: string): Promise<Array<{
    id: string;
    overallScore: number;
    grade: string;
    confidenceStatus: string;
    calculatedAt: string;
    taskOutcomeScore: number;
    qualityScore: number;
    deliveryScore: number;
    productivityScore: number;
    roleGoalScore: number;
    attendanceScore: number;
  }>> {
    const response = await apiClient.get<unknown>(`/employees/${employeeId}/scoring/history`);
    const data = (response && typeof response === 'object' && 'data' in response && response.data) ? response.data : response;
    return (data as Array<{
      id: string;
      overallScore: number;
      grade: string;
      confidenceStatus: string;
      calculatedAt: string;
      taskOutcomeScore: number;
      qualityScore: number;
      deliveryScore: number;
      productivityScore: number;
      roleGoalScore: number;
      attendanceScore: number;
    }>) || [];
  }
};
