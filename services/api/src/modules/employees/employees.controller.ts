import { Request, Response, NextFunction } from 'express';
import { employeesService } from './employees.service';
import { employeeScoringService } from './employee-scoring.service';
import { LifecycleStatus, TaskPriority, TaskStatus } from '@prisma/client';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export const employeesController = {
  // Directory & list
  async getEmployees(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        search,
        departmentId,
        departmentName,
        gender,
        minSalary,
        maxSalary,
        ranking,
        hierarchyLevel,
        status,
        sortBy,
        sortOrder
      } = req.query;

      const employees = await employeesService.getEmployees({
        search: search as string,
        departmentId: departmentId as string,
        departmentName: departmentName as string,
        gender: gender as string,
        minSalary: minSalary ? Number(minSalary) : undefined,
        maxSalary: maxSalary ? Number(maxSalary) : undefined,
        ranking: ranking ? Number(ranking) : undefined,
        hierarchyLevel: hierarchyLevel ? Number(hierarchyLevel) : undefined,
        status: status as LifecycleStatus,
        sortBy: sortBy as 'firstName' | 'lastName' | 'baseSalary' | 'ranking' | 'hierarchyLevel' | 'department' | 'hireDate' | 'employeeCode',
        sortOrder: (sortOrder as 'asc' | 'desc') || 'asc'
      });

      res.json({
        success: true,
        data: employees,
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  },

  // Get Single Employee Profile
  async getEmployeeById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const employee = await employeesService.getEmployeeById(id);
      res.json({
        success: true,
        data: employee,
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  },

  // Create Employee
  async createEmployee(req: Request, res: Response, next: NextFunction) {
    try {
      const employee = await employeesService.createEmployee(req.body);
      res.status(201).json({
        success: true,
        data: employee,
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  },

  // Update Employee
  async updateEmployee(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const employee = await employeesService.updateEmployee(id, req.body);
      res.json({
        success: true,
        data: employee,
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  },

  // Generate Credential & Invite
  async inviteEmployee(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await employeesService.createEmployeeCredentialsAndInvite(req.body, req.user!.id);
      res.status(201).json({
        success: true,
        data: result,
        message: 'Employee credentials created and onboarding link generated',
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  },

  async listDepartmentWorkers(req: Request, res: Response, next: NextFunction) {
    try {
      const workers = await employeesService.listDepartmentWorkers(req.user!.id, req.params.departmentId);
      res.json({ success: true, data: workers, requestId: req.id });
    } catch (err) { next(err); }
  },


  // Onboarding status check (Employee side)
  async getOnboardingStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user?.id;
      const { token } = req.query;
      const status = await employeesService.getOnboardingStatus(userId, token as string | undefined);
      res.json({
        success: true,
        data: status,
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  },

  // Submit complete onboarding (Employee side)
  async completeOnboarding(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user?.id;
      const token = (req.query.token as string | undefined) || (req.body.token as string | undefined);
      const result = await employeesService.completeOnboarding(userId, req.body, token);
      res.json({
        success: true,
        data: result,
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  },

  // Update personal details only (Post onboarding locked state)
  async updatePersonalDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user?.id;
      const token = (req.query.token as string | undefined) || (req.body.token as string | undefined);
      const result = await employeesService.updatePersonalDetailsOnly(userId, req.body, token);
      res.json({
        success: true,
        data: result,
        message: 'Personal details updated successfully',
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  },

  // Tasks Queue APIs
  async getTasks(req: Request, res: Response, next: NextFunction) {
    try {
      const { employeeId, department, status, priority, search } = req.query;
      const tasks = await employeesService.getAllTasks({
        actorId: req.user!.id,
        employeeId: employeeId as string,
        department: department as string,
        status: status as TaskStatus,
        priority: priority as TaskPriority,
        search: search as string
      });
      res.json({
        success: true,
        data: tasks,
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  },

  async createTask(req: Request, res: Response, next: NextFunction) {
    try {
      const task = await employeesService.createTask({ ...req.body, actorId: req.user!.id });
      res.status(201).json({
        success: true,
        data: task,
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  },

  async updateTask(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const task = await employeesService.updateTask(id, { ...req.body, actorId: req.user!.id });
      res.json({
        success: true,
        data: task,
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  },

  async deleteTask(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await employeesService.deleteTask(id, req.user!.id);
      res.json({
        success: true,
        message: 'Task deleted successfully',
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  },

  // Attendance APIs
  async getAttendance(req: Request, res: Response, next: NextFunction) {
    try {
      const { employeeId } = req.params;
      const { month, year } = req.query;
      const data = await employeesService.getEmployeeAttendance(
        employeeId,
        month ? Number(month) : undefined,
        year ? Number(year) : undefined
      );
      res.json({
        success: true,
        data,
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  },

  async markAttendance(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthRequest;
      const attendance = await employeesService.markAttendance({
        ...req.body,
        markedBy: authReq.user?.email || 'HR'
      });
      res.status(201).json({
        success: true,
        data: attendance,
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  },

  // Pay Slips APIs
  async getPaySlips(req: Request, res: Response, next: NextFunction) {
    try {
      const { employeeId } = req.params;
      const slips = await employeesService.getEmployeePaySlips(employeeId);
      res.json({
        success: true,
        data: slips,
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  },

  async generatePaySlip(req: Request, res: Response, next: NextFunction) {
    try {
      const slip = await employeesService.generatePaySlip(req.body);
      res.status(201).json({
        success: true,
        data: slip,
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  },

  // Documents APIs
  async getDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const { employeeId } = req.params;
      const docs = await employeesService.getEmployeeDocuments(employeeId);
      res.json({
        success: true,
        data: docs,
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  },

  async uploadDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const doc = await employeesService.addEmployeeDocument(req.body);
      res.status(201).json({
        success: true,
        data: doc,
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  },

  async deleteDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await employeesService.deleteEmployeeDocument(id);
      res.json({
        success: true,
        message: 'Document deleted successfully',
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  },

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { employeeId } = req.params;
      const newPassword = req.body.password || `Plinth@${Math.random().toString(36).substring(2, 8)}!`;
      const result = await employeesService.resetEmployeePassword(employeeId, newPassword);
      res.json({
        success: true,
        data: result,
        message: 'Password reset successfully',
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  },

  async getEmployeeAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const employeeId = typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined;
      const report = await employeeScoringService.scoreEmployees(employeeId);
      res.json({
        success: true,
        data: report,
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  },

  async getEmployeeScoreHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { employeeId } = req.params;
      const snapshots = await employeesService.getEmployeeScoreSnapshots(employeeId);
      res.json({
        success: true,
        data: snapshots,
        requestId: req.id
      });
    } catch (err) {
      next(err);
    }
  }
};
