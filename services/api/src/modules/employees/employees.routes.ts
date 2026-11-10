import { Router } from 'express';
import { optionalAuth, requireAuth } from '../../common/middleware/auth';
import { employeesController } from './employees.controller';

const router = Router();

// Employee Directory & CRUD
router.get('/employees', requireAuth, employeesController.getEmployees);
router.post('/employees', requireAuth, employeesController.createEmployee);
router.get('/employees/:id', requireAuth, employeesController.getEmployeeById);
router.patch('/employees/:id', requireAuth, employeesController.updateEmployee);

// Department-scoped shop-floor roster and worker onboarding.
router.get('/employees/departments/:departmentId/workers', requireAuth, employeesController.listDepartmentWorkers);

// Credential creation & Onboarding Invite (HR Module)
router.post('/employees/invite', requireAuth, employeesController.inviteEmployee);
router.post('/employees/:employeeId/reset-password', requireAuth, employeesController.resetPassword);
// Onboarding Employee Side (Supports token-based invite or authenticated session)
router.get('/employees/onboarding/status', optionalAuth, employeesController.getOnboardingStatus);
router.post('/employees/onboarding/complete', optionalAuth, employeesController.completeOnboarding);
router.patch('/employees/onboarding/personal-details', optionalAuth, employeesController.updatePersonalDetails);

// Task Queue (Global and by employee)
router.get('/employees/tasks/queue', requireAuth, employeesController.getTasks);
router.post('/employees/tasks/queue', requireAuth, employeesController.createTask);
router.patch('/employees/tasks/queue/:id', requireAuth, employeesController.updateTask);
router.delete('/employees/tasks/queue/:id', requireAuth, employeesController.deleteTask);

// Attendance APIs
router.get('/employees/:employeeId/attendance', requireAuth, employeesController.getAttendance);
router.post('/employees/attendance/mark', requireAuth, employeesController.markAttendance);

// Pay Slips APIs
router.get('/employees/:employeeId/pay-slips', requireAuth, employeesController.getPaySlips);
router.post('/employees/pay-slips/generate', requireAuth, employeesController.generatePaySlip);

// Documents APIs
router.get('/employees/:employeeId/documents', requireAuth, employeesController.getDocuments);
router.post('/employees/documents/upload', requireAuth, employeesController.uploadDocument);
router.delete('/employees/documents/:id', requireAuth, employeesController.deleteDocument);

// Employee Scoring & Analytics Report
router.get('/employees/analytics/scoring', requireAuth, employeesController.getEmployeeAnalytics);
router.get('/employees/:employeeId/scoring/history', requireAuth, employeesController.getEmployeeScoreHistory);
export default router;
