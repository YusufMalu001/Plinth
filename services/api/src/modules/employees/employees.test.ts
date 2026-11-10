import { describe, it, expect } from '@jest/globals';
import { employeesService } from './employees.service';

describe('Employees and HR Module Service Logic', () => {
  it('should export all required HR workflow methods', () => {
    expect(typeof employeesService.getDepartmentActor).toBe('function');
    expect(typeof employeesService.listDepartmentWorkers).toBe('function');
    expect(typeof employeesService.getEmployees).toBe('function');
    expect(typeof employeesService.getEmployeeById).toBe('function');
    expect(typeof employeesService.createEmployee).toBe('function');
    expect(typeof employeesService.updateEmployee).toBe('function');
    expect(typeof employeesService.createEmployeeCredentialsAndInvite).toBe('function');
    expect(typeof employeesService.getOnboardingStatus).toBe('function');
    expect(typeof employeesService.completeOnboarding).toBe('function');
    expect(typeof employeesService.updatePersonalDetailsOnly).toBe('function');
    expect(typeof employeesService.getAllTasks).toBe('function');
    expect(typeof employeesService.createTask).toBe('function');
    expect(typeof employeesService.updateTask).toBe('function');
    expect(typeof employeesService.deleteTask).toBe('function');
    expect(typeof employeesService.getEmployeeAttendance).toBe('function');
    expect(typeof employeesService.markAttendance).toBe('function');
    expect(typeof employeesService.getEmployeePaySlips).toBe('function');
    expect(typeof employeesService.generatePaySlip).toBe('function');
    expect(typeof employeesService.getEmployeeDocuments).toBe('function');
    expect(typeof employeesService.addEmployeeDocument).toBe('function');
    expect(typeof employeesService.deleteEmployeeDocument).toBe('function');
    expect(typeof employeesService.resetEmployeePassword).toBe('function');
  });
});
