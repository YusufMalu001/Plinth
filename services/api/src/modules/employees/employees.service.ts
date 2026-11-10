import { PrismaClient, Prisma, TaskStatus, TaskPriority, AttendanceStatus, PaySlipStatus, LifecycleStatus, NotificationType } from '@prisma/client';
import argon2 from 'argon2';
import crypto from 'crypto';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../../common/errors/AppError';
import { generateSequentialNumber } from '../../common/utils/sequence';
import { notificationService } from '../notifications/notification.service';
import { config } from '../../config';
import { ensureDepartmentInchargeRole, ensureShopFloorOperatorRole } from '../users/rbac';

const prisma = new PrismaClient();

export interface GetEmployeesFilter {
  search?: string;
  departmentId?: string;
  departmentName?: string;
  gender?: string;
  minSalary?: number;
  maxSalary?: number;
  ranking?: number;
  hierarchyLevel?: number;
  status?: LifecycleStatus;
  sortBy?: 'firstName' | 'lastName' | 'baseSalary' | 'ranking' | 'hierarchyLevel' | 'department' | 'hireDate' | 'employeeCode';
  sortOrder?: 'asc' | 'desc';
}

export interface CreateEmployeeInput {
  employeeCode?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role?: string;
  departmentId?: string;
  gender?: string;
  dateOfBirth?: string;
  hireDate?: string;
  ranking?: number;
  designation?: string;
  hierarchyLevel?: number;
  baseSalary?: number;
  hourlyRate?: number;
  managerId?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  bloodGroup?: string;
  maritalStatus?: string;
  bankAccountNumber?: string;
  bankName?: string;
  bankIfscCode?: string;
  panNumber?: string;
  aadhaarNumber?: string;
  pfNumber?: string;
  esiNumber?: string;
  status?: LifecycleStatus;
}

export const employeesService = {
  async getDepartmentActor(actorId: string) {
    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: {
        id: true, role: true, employeeRefId: true, assignedDepartmentId: true,
        userRoles: { select: { role: { select: { name: true } } } }
      }
    });
    if (!actor) throw new ForbiddenError('A valid signed-in account is required.');
    const roles = actor.userRoles.map(({ role }) => role.name.toLowerCase().replace(/-/g, '_'));
    const admin = actor.role === 'admin' || roles.some((role) => ['admin', 'super_admin'].includes(role));
    const hr = roles.some((role) => ['hr', 'hr_manager'].includes(role));
    const global = admin || hr || roles.includes('production_manager');
    const supervisor = roles.some((role) => ['department_head', 'department_incharge', 'dept_head'].includes(role));
    const operator = !global && !supervisor && (Boolean(actor.employeeRefId) || roles.some((role) => ['shop_floor_operator', 'operator'].includes(role)));
    return { ...actor, roles, admin, hr, global, supervisor, operator };
  },

  async listDepartmentWorkers(actorId: string, departmentId: string) {
    const actor = await employeesService.getDepartmentActor(actorId);
    if (!actor.global && (!actor.supervisor && !actor.operator || actor.assignedDepartmentId !== departmentId)) {
      throw new ForbiddenError('You can view workers only in your assigned department.');
    }
    return prisma.employee.findMany({
      where: { departmentId },
      orderBy: [{ status: 'asc' }, { firstName: 'asc' }, { lastName: 'asc' }],
      select: {
        id: true, employeeCode: true, firstName: true, lastName: true, email: true,
        phone: true, role: true, status: true,
        userAccounts: { select: { id: true, email: true, isActive: true, userRoles: { select: { role: { select: { name: true } } } } } }
      }
    });
  },

  // 1. Employee Directory Listing with Filtering & Sorting
  async getEmployees(filter: GetEmployeesFilter = {}) {
    const {
      search,
      departmentId,
      gender,
      minSalary,
      maxSalary,
      ranking,
      hierarchyLevel,
      status,
      sortBy = 'firstName',
      sortOrder = 'asc'
    } = filter;

    const where: Prisma.EmployeeWhereInput = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { employeeCode: { contains: search, mode: 'insensitive' } },
        { designation: { contains: search, mode: 'insensitive' } },
        { role: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (departmentId) {
      where.departmentId = departmentId;
    }

    if (gender) {
      where.gender = { equals: gender, mode: 'insensitive' };
    }

    if (ranking !== undefined && !isNaN(ranking)) {
      where.ranking = ranking;
    }

    if (hierarchyLevel !== undefined && !isNaN(hierarchyLevel)) {
      where.hierarchyLevel = hierarchyLevel;
    }

    if (minSalary !== undefined || maxSalary !== undefined) {
      where.baseSalary = {};
      if (minSalary !== undefined) where.baseSalary.gte = minSalary;
      if (maxSalary !== undefined) where.baseSalary.lte = maxSalary;
    }

    if (status) {
      where.status = status;
    }

    let orderBy: Prisma.EmployeeOrderByWithRelationInput = {};
    if (sortBy === 'department') {
      orderBy = { department: { name: sortOrder } };
    } else if (sortBy === 'hierarchyLevel') {
      orderBy = { hierarchyLevel: sortOrder };
    } else if (sortBy === 'ranking') {
      orderBy = { ranking: sortOrder };
    } else if (sortBy === 'baseSalary') {
      orderBy = { baseSalary: sortOrder };
    } else if (sortBy === 'hireDate') {
      orderBy = { hireDate: sortOrder };
    } else if (sortBy === 'employeeCode') {
      orderBy = { employeeCode: sortOrder };
    } else if (sortBy === 'lastName') {
      orderBy = { lastName: sortOrder };
    } else {
      orderBy = { firstName: sortOrder };
    }

    const employees = await prisma.employee.findMany({
      where,
      orderBy,
      include: {
        department: { select: { id: true, name: true, code: true } },
        manager: { select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true } },
        _count: {
          select: {
            tasks: true,
            attendances: true,
            paySlips: true,
            documents: true
          }
        }
      }
    });

    return employees;
  },

  // 2. Employee Profile Details (Single Employee + relations)
  async getEmployeeById(id: string) {
    let employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        department: true,
        manager: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true }
        },
        directReports: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true, role: true }
        },
        tasks: {
          orderBy: { createdAt: 'desc' }
        },
        attendances: {
          orderBy: { date: 'desc' },
          take: 30
        },
        paySlips: {
          orderBy: [{ year: 'desc' }, { month: 'desc' }]
        },
        documents: {
          orderBy: { uploadedAt: 'desc' }
        },
        workExperiences: {
          orderBy: { startDate: 'desc' }
        },
        onboardingDetails: true,
        userAccounts: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
            onboardingCompleted: true,
            lastLoginAt: true,
            mustChangePassword: true,
            initialPassword: true,
            createdAt: true,
            userRoles: {
              include: {
                role: {
                  include: {
                    permissions: {
                      include: {
                        permission: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!employee) {
      throw new NotFoundError('Employee not found');
    }

    // If no user account is linked yet, auto-link or provision one so default credentials work
    if (!employee.userAccounts || employee.userAccounts.length === 0) {
      const normalizedEmail = employee.email.trim().toLowerCase();
      const defaultPassword = 'Synergy@2026!';
      const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            employeeRefId: employee.id,
            employeeId: employee.employeeCode,
            initialPassword: user.initialPassword || defaultPassword
          }
        });
      } else {
        const hashedPassword = await argon2.hash(defaultPassword, { type: argon2.argon2id });
        await prisma.user.create({
          data: {
            email: normalizedEmail,
            firstName: employee.firstName,
            lastName: employee.lastName,
            name: `${employee.firstName} ${employee.lastName}`.trim(),
            password: hashedPassword,
            role: 'employee',
            employeeRefId: employee.id,
            employeeId: employee.employeeCode,
            phone: employee.phone || null,
            title: employee.designation || employee.role || 'Employee',
            initialPassword: defaultPassword,
            mustChangePassword: true,
            onboardingCompleted: false
          }
        });
      }

      employee = await prisma.employee.findUnique({
        where: { id },
        include: {
          department: true,
          manager: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true }
          },
          directReports: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true, role: true }
          },
          tasks: {
            orderBy: { createdAt: 'desc' }
          },
          attendances: {
            orderBy: { date: 'desc' },
            take: 30
          },
          paySlips: {
            orderBy: [{ year: 'desc' }, { month: 'desc' }]
          },
          documents: {
            orderBy: { uploadedAt: 'desc' }
          },
          workExperiences: {
            orderBy: { startDate: 'desc' }
          },
          onboardingDetails: true,
          userAccounts: {
            select: {
              id: true,
              email: true,
              role: true,
              isActive: true,
              onboardingCompleted: true,
              lastLoginAt: true,
              mustChangePassword: true,
              initialPassword: true,
              createdAt: true,
              userRoles: {
                include: {
                  role: {
                    include: {
                      permissions: {
                        include: {
                          permission: true
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });
    }

    return employee!;
  },

  // 3. Create new employee directly (or via onboarding initiation)
  async createEmployee(data: CreateEmployeeInput) {
    const normalizedEmail = data.email.trim().toLowerCase();
    const existing = await prisma.employee.findUnique({
      where: { email: normalizedEmail }
    });
    if (existing) {
      throw new ConflictError('Employee with this email already exists');
    }

    // Auto-generate employeeCode if missing
    let code = data.employeeCode;
    if (!code) {
      code = await generateSequentialNumber({
        prefix: 'EMP-',
        countByPrefix: (prefix) => prisma.employee.count({ where: { employeeCode: { startsWith: prefix } } }),
        existsByNumber: async (candidate) => Boolean(await prisma.employee.findUnique({ where: { employeeCode: candidate } })),
        padLength: 4
      });
    }

    const employee = await prisma.employee.create({
      data: {
        employeeCode: code,
        firstName: data.firstName,
        lastName: data.lastName,
        email: normalizedEmail,
        phone: data.phone,
        role: data.role || 'Employee',
        departmentId: data.departmentId || null,
        gender: data.gender || null,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        hireDate: data.hireDate ? new Date(data.hireDate) : new Date(),
        ranking: data.ranking ? Number(data.ranking) : 1,
        designation: data.designation || data.role || 'Employee',
        hierarchyLevel: data.hierarchyLevel ? Number(data.hierarchyLevel) : 4,
        baseSalary: data.baseSalary ? new Prisma.Decimal(data.baseSalary) : new Prisma.Decimal(0),
        hourlyRate: data.hourlyRate ? new Prisma.Decimal(data.hourlyRate) : null,
        managerId: data.managerId || null,
        addressLine1: data.addressLine1 || null,
        addressLine2: data.addressLine2 || null,
        city: data.city || null,
        state: data.state || null,
        postalCode: data.postalCode || null,
        country: data.country || 'India',
        emergencyContactName: data.emergencyContactName || null,
        emergencyContactPhone: data.emergencyContactPhone || null,
        emergencyContactRelation: data.emergencyContactRelation || null,
        bloodGroup: data.bloodGroup || null,
        maritalStatus: data.maritalStatus || null,
        bankAccountNumber: data.bankAccountNumber || null,
        bankName: data.bankName || null,
        bankIfscCode: data.bankIfscCode || null,
        panNumber: data.panNumber || null,
        aadhaarNumber: data.aadhaarNumber || null,
        pfNumber: data.pfNumber || null,
        esiNumber: data.esiNumber || null,
        status: data.status || LifecycleStatus.ACTIVE
      },
      include: {
        department: true,
        manager: true
      }
    });

    // Provision associated user credentials with the default system initial password
    const defaultPassword = 'Synergy@2026!';
    const hashedPassword = await argon2.hash(defaultPassword, { type: argon2.argon2id });
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          name: `${data.firstName} ${data.lastName}`.trim(),
          employeeRefId: employee.id,
          employeeId: employee.employeeCode,
          phone: data.phone || user.phone,
          department: data.departmentId || user.department,
          title: data.designation || data.role || user.title,
          initialPassword: user.initialPassword || defaultPassword
        }
      });
    } else {
      await prisma.user.create({
        data: {
          email: normalizedEmail,
          firstName: data.firstName,
          lastName: data.lastName,
          name: `${data.firstName} ${data.lastName}`.trim(),
          password: hashedPassword,
          role: 'employee',
          employeeRefId: employee.id,
          employeeId: employee.employeeCode,
          phone: data.phone || null,
          title: data.designation || data.role || 'Employee',
          initialPassword: defaultPassword,
          mustChangePassword: true,
          onboardingCompleted: false
        }
      });
    }

    return employee;
  },

  // 4. Update Employee
  async updateEmployee(id: string, data: Partial<CreateEmployeeInput>) {
    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Employee not found');

    const updateData: Prisma.EmployeeUpdateInput = {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      role: data.role,
      gender: data.gender,
      designation: data.designation,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2,
      city: data.city,
      state: data.state,
      postalCode: data.postalCode,
      country: data.country,
      emergencyContactName: data.emergencyContactName,
      emergencyContactPhone: data.emergencyContactPhone,
      emergencyContactRelation: data.emergencyContactRelation,
      bloodGroup: data.bloodGroup,
      maritalStatus: data.maritalStatus,
      bankAccountNumber: data.bankAccountNumber,
      bankName: data.bankName,
      bankIfscCode: data.bankIfscCode,
      panNumber: data.panNumber,
      aadhaarNumber: data.aadhaarNumber,
      pfNumber: data.pfNumber,
      esiNumber: data.esiNumber,
      status: data.status
    };

    if (data.departmentId !== undefined) {
      updateData.department = data.departmentId ? { connect: { id: data.departmentId } } : { disconnect: true };
    }
    if (data.managerId !== undefined) {
      updateData.manager = data.managerId ? { connect: { id: data.managerId } } : { disconnect: true };
    }
    if (data.dateOfBirth) updateData.dateOfBirth = new Date(data.dateOfBirth);
    if (data.hireDate) updateData.hireDate = new Date(data.hireDate);
    if (data.baseSalary !== undefined) updateData.baseSalary = new Prisma.Decimal(data.baseSalary);
    if (data.hourlyRate !== undefined) updateData.hourlyRate = data.hourlyRate ? new Prisma.Decimal(data.hourlyRate) : null;
    if (data.ranking !== undefined) updateData.ranking = Number(data.ranking);
    if (data.hierarchyLevel !== undefined) updateData.hierarchyLevel = Number(data.hierarchyLevel);

    const employee = await prisma.employee.update({
      where: { id },
      data: updateData,
      include: {
        department: true,
        manager: true
      }
    });

    return employee;
  },

  // 5. Onboarding / Credential Creation by HR
  async createEmployeeCredentialsAndInvite(input: {
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
  }, actorId: string) {
    const actor = await employeesService.getDepartmentActor(actorId);
    const isDepartmentHead = actor.roles.some((role) => ['department_head', 'department_incharge', 'dept_head'].includes(role));
    if (!actor.admin && !actor.hr && !isDepartmentHead) throw new ForbiddenError('Only HR, administrators, or department heads can create employee accounts.');
    const isShopFloorWorker =
      input.accessRoleKey === 'shop_floor_operator' ||
      input.role === 'shop_floor_operator' ||
      input.role === 'Shop Floor Operator';
    if (isShopFloorWorker && !input.accessRoleKey) {
      input.accessRoleKey = 'shop_floor_operator';
    }
    if (isDepartmentHead && !actor.admin && !actor.hr) {
      if (!actor.assignedDepartmentId || input.departmentId !== actor.assignedDepartmentId) throw new ForbiddenError('Department heads can create employees only in their assigned department.');
      if (!isShopFloorWorker) throw new ForbiddenError('Department heads can provision only shop-floor worker accounts.');
      if (input.employeeId) throw new ForbiddenError('Department heads cannot attach an existing employee profile to a new login.');
    }
    if (isShopFloorWorker && !input.departmentId) throw new ValidationError('Select the department this worker belongs to.');
    if (isDepartmentHead && !actor.admin && !actor.hr) {
      const [existingEmployee, existingAccount] = await Promise.all([
        prisma.employee.findUnique({ where: { email: input.email.trim().toLowerCase() }, select: { id: true } }),
        prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() }, select: { id: true } })
      ]);
      if (existingEmployee || existingAccount) throw new ConflictError('This email is already registered. Ask HR to review the existing record.');
    }
    const email = input.email.trim().toLowerCase();
    let accessRole = null;
    if (input.accessRoleKey === 'shop_floor_operator') accessRole = await ensureShopFloorOperatorRole();
    else if (input.accessRoleKey === 'department_incharge') accessRole = await ensureDepartmentInchargeRole();
    else if (input.accessRoleKey) {
      accessRole = await prisma.rbacRole.findUnique({ where: { name: input.accessRoleKey } });
      if (!accessRole) throw new ValidationError('The selected access role is not configured.');
    }
    let employeeId = input.employeeId;
    let employee;

    if (employeeId) {
      employee = await prisma.employee.findUnique({ where: { id: employeeId } });
      if (!employee) throw new NotFoundError('Employee not found');
    } else {
      // Check if employee already exists with email
      employee = await prisma.employee.findUnique({ where: { email } });
      if (!employee) {
        // Auto-generate robust employee code
        const code = await generateSequentialNumber({
          prefix: 'EMP-',
          countByPrefix: (prefix) => prisma.employee.count({ where: { employeeCode: { startsWith: prefix } } }),
          existsByNumber: async (candidate) => Boolean(await prisma.employee.findUnique({ where: { employeeCode: candidate } })),
          padLength: 4
        });
        employee = await prisma.employee.create({
          data: {
            employeeCode: code,
            firstName: input.firstName,
            lastName: input.lastName,
            email,
            phone: input.phone || null,
            role: isShopFloorWorker ? 'Shop Floor Operator' : (input.role || 'Employee'),
            departmentId: input.departmentId || null,
            designation: isShopFloorWorker ? 'Shop Floor Operator' : (input.designation || input.role || 'Employee'),
            ranking: input.ranking ? Number(input.ranking) : 1,
            hierarchyLevel: isShopFloorWorker ? 5 : (input.hierarchyLevel ? Number(input.hierarchyLevel) : 4),
            baseSalary: isShopFloorWorker ? new Prisma.Decimal(0) : (input.baseSalary ? new Prisma.Decimal(input.baseSalary) : new Prisma.Decimal(0)),
            gender: input.gender || null,
            status: LifecycleStatus.ACTIVE
          }
        });
      }
      employeeId = employee.id;
    }

    // Generate onboarding token and temporary password
    const onboardingToken = crypto.randomBytes(32).toString('hex');
    const password = input.tempPassword || `Synergy@${crypto.randomBytes(5).toString('hex')}!`;
    const hashedPassword = await argon2.hash(password, { type: argon2.argon2id });

    // Department heads may provision only new worker logins. Never reuse an existing account.
    const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true, employeeRefId: true, userRoles: { select: { role: { select: { name: true } } } } } });
    if (isDepartmentHead && !actor.admin && !actor.hr && (existingUser || employee.departmentId !== actor.assignedDepartmentId)) {
      throw new ConflictError('This email or employee profile is already registered; ask HR to review the existing record.');
    }

    // A previously detached employee can be reused after an administrative
    // reset, but an employee who is still assigned to another department must
    // go through HR's transfer workflow.
    if (isShopFloorWorker && employee.departmentId && employee.departmentId !== input.departmentId) {
      throw new ConflictError('This employee profile belongs to a different department. Ask HR to review the transfer.');
    }
    if (isShopFloorWorker && existingUser && (existingUser.role !== 'employee' || existingUser.employeeRefId !== employee.id || existingUser.userRoles.some(({ role }) => role.name !== 'shop_floor_operator'))) {
      throw new ConflictError('This login already has another employee link or access role. Ask an administrator to review it.');
    }
    if (isShopFloorWorker) {
      employee = await prisma.employee.update({
        where: { id: employee.id },
        data: {
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          email,
          phone: input.phone || employee.phone,
          role: 'Shop Floor Operator',
          departmentId: input.departmentId,
          designation: input.designation?.trim() || 'Shop Floor Operator',
          hierarchyLevel: 5,
          status: LifecycleStatus.ACTIVE,
          deactivatedAt: null
        }
      });
    }
    // Create or update User credential
    let user = existingUser ? await prisma.user.findUnique({ where: { id: existingUser.id } }) : null;
    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          name: `${input.firstName} ${input.lastName}`,
          password: hashedPassword,
          role: isShopFloorWorker ? 'employee' : undefined,
          isActive: true,
          employeeStatus: 'Active',
          employeeRefId: employeeId,
          employeeId: employee.employeeCode,
          phone: input.phone || employee.phone,
          department: input.departmentId || employee.departmentId,
          assignedDepartmentId: input.departmentId || employee.departmentId,
          title: input.designation || employee.designation,
          onboardingToken,
          initialPassword: password,
          onboardingCompleted: false,
          mustChangePassword: true
        }
      });
    } else {
      user = await prisma.user.create({
        data: {
          email,
          firstName: input.firstName,
          lastName: input.lastName,
          name: `${input.firstName} ${input.lastName}`,
          password: hashedPassword,
          role: 'employee',
          employeeRefId: employeeId,
          employeeId: employee.employeeCode,
          phone: input.phone || employee.phone,
          department: input.departmentId || employee.departmentId,
          assignedDepartmentId: input.departmentId || employee.departmentId,
          title: input.designation || employee.designation,
          onboardingToken,
          initialPassword: password,
          onboardingCompleted: false,
          mustChangePassword: true
        }
      });
    }

    if (accessRole) {
      await prisma.userRole.createMany({ data: [{ userId: user.id, roleId: accessRole.id }], skipDuplicates: true });
    }
    // Initialize Onboarding details record if not present
    await prisma.onboardingDetails.upsert({
      where: { employeeId: employeeId! },
      create: {
        employeeId: employeeId!,
        personalDetailsComplete: false,
        documentsUploadComplete: false,
        experienceComplete: false,
        agreementsComplete: false
      },
      update: {}
    });

    const invitePath = `/onboarding?token=${onboardingToken}&email=${encodeURIComponent(input.email)}`;
    const inviteLink = invitePath;
    const webBaseUrl = config.webOrigin.replace(/\/+$/, '');
    const fullInviteUrl = `${webBaseUrl}${invitePath}`;

    return {
      employee,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      tempPassword: password,
      accessRoleName: accessRole?.name || null,
      onboardingToken,
      inviteLink,
      fullInviteUrl
    };
  },

  // 6. Onboarding Flow APIs (for Employee Side)
  async getOnboardingStatus(userId?: string, token?: string) {
    let user;
    if (token) {
      user = await prisma.user.findFirst({
        where: { onboardingToken: token },
        include: {
          employeeRef: {
            include: {
              department: true,
              onboardingDetails: true,
              documents: true,
              workExperiences: true
            }
          }
        }
      });
    } else if (userId) {
      user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          employeeRef: {
            include: {
              department: true,
              onboardingDetails: true,
              documents: true,
              workExperiences: true
            }
          }
        }
      });
    }

    if (!user) {
      throw new NotFoundError('User onboarding profile not found');
    }

    return {
      userId: user.id,
      email: user.email,
      onboardingCompleted: user.onboardingCompleted,
      employee: user.employeeRef,
      onboardingDetails: user.employeeRef?.onboardingDetails || null
    };
  },

  // Complete Onboarding - Submit full 4-step wizard
  async completeOnboarding(userId?: string, data?: {
    personalDetails: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      gender?: string;
      dateOfBirth?: string;
      maritalStatus?: string;
      bloodGroup?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      emergencyContactRelation?: string;
      bankAccountNumber?: string;
      bankName?: string;
      bankIfscCode?: string;
      panNumber?: string;
      aadhaarNumber?: string;
    };
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
      signatureText?: string;
      signatureImage?: string;
    };
  }, token?: string) {
    if (!data) throw new Error('Onboarding data is required');
    let user;
    if (token) {
      user = await prisma.user.findFirst({
        where: { onboardingToken: token },
        include: { employeeRef: true }
      });
    }
    
    if (!user && userId) {
      user = await prisma.user.findUnique({
        where: { id: userId },
        include: { employeeRef: true }
      });
    }

    // Fallback: If user was not found by token or userId, try finding by email from personal details
    if (!user && data.personalDetails) {
      const emailCandidate = (data.personalDetails as { email?: string }).email?.trim().toLowerCase();
      if (emailCandidate) {
        user = await prisma.user.findUnique({
          where: { email: emailCandidate },
          include: { employeeRef: true }
        });
      }
    }

    if (!user) throw new NotFoundError('User not found');
    let employeeId = user.employeeRefId;
    if (!employeeId) {
      if (user.employeeRef?.id) {
        employeeId = user.employeeRef.id;
      } else {
        // Find by email or create
        let emp = await prisma.employee.findUnique({ where: { email: user.email } });
        if (!emp) {
          const count = await prisma.employee.count();
          emp = await prisma.employee.create({
            data: {
              employeeCode: `EMP-${String(count + 1).padStart(4, '0')}`,
              firstName: user.firstName || 'Employee',
              lastName: user.lastName || '',
              email: user.email,
              role: 'Employee'
            }
          });
        }
        employeeId = emp.id;
        await prisma.user.update({
          where: { id: user.id },
          data: { employeeRefId: employeeId }
        });
      }
    }

    // 1. Update Employee personal details safely
    const p = data.personalDetails || {};
    let dobDate: Date | undefined = undefined;
    if (p.dateOfBirth) {
      const parsed = new Date(p.dateOfBirth);
      if (!isNaN(parsed.getTime())) {
        dobDate = parsed;
      }
    }

    await prisma.employee.update({
      where: { id: employeeId },
      data: {
        firstName: p.firstName || user.firstName || undefined,
        lastName: p.lastName || user.lastName || undefined,
        phone: p.phone || undefined,
        gender: p.gender || undefined,
        dateOfBirth: dobDate,
        maritalStatus: p.maritalStatus || undefined,
        bloodGroup: p.bloodGroup || undefined,
        addressLine1: p.addressLine1 || undefined,
        addressLine2: p.addressLine2 || undefined,
        city: p.city || undefined,
        state: p.state || undefined,
        postalCode: p.postalCode || undefined,
        country: p.country || 'India',
        emergencyContactName: p.emergencyContactName || undefined,
        emergencyContactPhone: p.emergencyContactPhone || undefined,
        emergencyContactRelation: p.emergencyContactRelation || undefined,
        bankAccountNumber: p.bankAccountNumber || undefined,
        bankName: p.bankName || undefined,
        bankIfscCode: p.bankIfscCode ? p.bankIfscCode.toUpperCase() : undefined,
        panNumber: p.panNumber ? p.panNumber.toUpperCase() : undefined,
        aadhaarNumber: p.aadhaarNumber || undefined,
        onboardingCompleted: true,
        onboardingCompletedAt: new Date()
      }
    });

    // 2. Upsert Documents by employee, category, and title so seeded examples and retries do not create duplicates.
    if (data.documents && data.documents.length > 0) {
      for (const doc of data.documents) {
        const existingDocument = await prisma.employeeDocument.findFirst({
          where: { employeeId, category: doc.category || 'ID_PROOF', title: doc.title }
        });
        const documentData = {
          employeeId,
          title: doc.title,
          category: doc.category || 'ID_PROOF',
          fileUrl: doc.fileUrl,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          verified: false
        };
        if (existingDocument) {
          await prisma.employeeDocument.update({ where: { id: existingDocument.id }, data: documentData });
        } else {
          await prisma.employeeDocument.create({ data: documentData });
        }
      }
    }

    // 3. Upsert work experience by employer, title, and start date.
    if (data.workExperiences && data.workExperiences.length > 0) {
      for (const exp of data.workExperiences) {
        if (!exp.companyName || !exp.jobTitle || !exp.startDate) continue;
        const startDateObj = new Date(exp.startDate);
        if (isNaN(startDateObj.getTime())) continue;
        const endDateObj = exp.endDate ? new Date(exp.endDate) : null;
        const experienceData = {
          employeeId,
          companyName: exp.companyName,
          jobTitle: exp.jobTitle,
          startDate: startDateObj,
          endDate: endDateObj && !isNaN(endDateObj.getTime()) ? endDateObj : null,
          isCurrent: exp.isCurrent || false,
          responsibilities: exp.responsibilities,
          location: exp.location
        };
        const existingExperience = await prisma.workExperience.findFirst({
          where: { employeeId, companyName: exp.companyName, jobTitle: exp.jobTitle, startDate: startDateObj }
        });
        if (existingExperience) {
          await prisma.workExperience.update({ where: { id: existingExperience.id }, data: experienceData });
        } else {
          await prisma.workExperience.create({ data: experienceData });
        }
      }
    }

    // 4. Update Onboarding Details record
    const signatureValue = data.agreements.signatureImage || data.agreements.signatureText || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Signed Electronic Acknowledgement';

    await prisma.onboardingDetails.upsert({
      where: { employeeId },
      create: {
        employeeId,
        personalDetailsComplete: true,
        documentsUploadComplete: true,
        experienceComplete: true,
        agreementsComplete: true,
        agreedToTerms: Boolean(data.agreements.agreedToTerms),
        agreedToConductCode: Boolean(data.agreements.agreedToConductCode),
        agreedToNda: Boolean(data.agreements.agreedToNda),
        signatureText: signatureValue,
        agreedAt: new Date(),
        completedAt: new Date()
      },
      update: {
        personalDetailsComplete: true,
        documentsUploadComplete: true,
        experienceComplete: true,
        agreementsComplete: true,
        agreedToTerms: Boolean(data.agreements.agreedToTerms),
        agreedToConductCode: Boolean(data.agreements.agreedToConductCode),
        agreedToNda: Boolean(data.agreements.agreedToNda),
        signatureText: signatureValue,
        agreedAt: new Date(),
        completedAt: new Date()
      }
    });

    // 5. Mark user onboardingCompleted = true
    await prisma.user.update({
      where: { id: user.id },
      data: {
        onboardingCompleted: true
      }
    });
    return {
      success: true,
      message: 'Onboarding completed successfully'
    };
  },

  // Update only personal details after onboarding is locked
  async updatePersonalDetailsOnly(userId?: string, personalDetails?: {
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    emergencyContactRelation?: string;
    maritalStatus?: string;
    bloodGroup?: string;
  }, token?: string) {
    if (!personalDetails) throw new Error('Personal details are required');
    let user;
    if (token) {
      user = await prisma.user.findFirst({
        where: { onboardingToken: token },
        include: { employeeRef: true }
      });
    } else if (userId) {
      user = await prisma.user.findUnique({
        where: { id: userId },
        include: { employeeRef: true }
      });
    }

    if (!user || !user.employeeRefId) {
      throw new NotFoundError('Employee profile not linked to this user');
    }

    const employeeId = user.employeeRefId;

    const updated = await prisma.employee.update({
      where: { id: employeeId },
      data: {
        phone: personalDetails.phone,
        addressLine1: personalDetails.addressLine1,
        addressLine2: personalDetails.addressLine2,
        city: personalDetails.city,
        state: personalDetails.state,
        postalCode: personalDetails.postalCode,
        country: personalDetails.country,
        emergencyContactName: personalDetails.emergencyContactName,
        emergencyContactPhone: personalDetails.emergencyContactPhone,
        emergencyContactRelation: personalDetails.emergencyContactRelation,
        maritalStatus: personalDetails.maritalStatus,
        bloodGroup: personalDetails.bloodGroup
      }
    });

    return updated;
  },

  // 7. TASK QUEUE APIS
  async getAllTasks(filter: {
    actorId: string;
    employeeId?: string;
    department?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    search?: string;
  }) {
    const actor = await employeesService.getDepartmentActor(filter.actorId);
    const where: Prisma.EmployeeTaskWhereInput = {};
    if (actor.operator) {
      if (!actor.employeeRefId) throw new ForbiddenError('This account is not linked to an employee profile.');
      where.employeeId = actor.employeeRefId;
    } else if (!actor.global && actor.supervisor) {
      if (!actor.assignedDepartmentId) throw new ForbiddenError('This account is not assigned to a department.');
      where.employee = { departmentId: actor.assignedDepartmentId };
    } else if (actor.global) {
      if (filter.employeeId) where.employeeId = filter.employeeId;
      if (filter.department) where.department = filter.department;
    } else {
      throw new ForbiddenError('You are not authorized to view employee task queues.');
    }
    if (filter.status) where.status = filter.status;
    if (filter.priority) where.priority = filter.priority;
    if (filter.search) {
      where.OR = [
        { title: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
        { employee: { firstName: { contains: filter.search, mode: 'insensitive' } } },
        { employee: { lastName: { contains: filter.search, mode: 'insensitive' } } },
        { employee: { employeeCode: { contains: filter.search, mode: 'insensitive' } } }
      ];
    }

    const tasks = await prisma.employeeTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
            department: { select: { name: true } }
          }
        }
      }
    });

    return tasks;
  },

  async createTask(data: {
    actorId: string;
    title: string;
    description?: string;
    employeeId: string;
    assignedBy?: string;
    department?: string;
    priority?: TaskPriority;
    status?: TaskStatus;
    dueDate?: string;
    notes?: string;
  }) {
    const actor = await employeesService.getDepartmentActor(data.actorId);
    if (!actor.global && !actor.supervisor) throw new ForbiddenError('Only administrators or department supervisors can assign tasks.');
    const assignedEmployee = await prisma.employee.findUnique({ where: { id: data.employeeId }, select: { id: true, departmentId: true, department: { select: { name: true } }, firstName: true, lastName: true, email: true } });
    if (!assignedEmployee) throw new NotFoundError('Assigned employee not found.');
    if (!actor.global && assignedEmployee.departmentId !== actor.assignedDepartmentId) throw new ForbiddenError('You can assign tasks only to workers in your department.');
    const task = await prisma.employeeTask.create({
      data: {
        title: data.title,
        description: data.description,
        employeeId: assignedEmployee.id,
        assignedBy: data.actorId,
        department: assignedEmployee.department?.name,
        priority: data.priority || TaskPriority.MEDIUM,
        status: data.status || TaskStatus.PENDING,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        notes: data.notes
      },
      include: {
        employee: true
      }
    });

    // Send notification to the assigned employee (find user matching employeeRefId or email)
    try {
      const recipientUser = await prisma.user.findFirst({
        where: {
          OR: [
            { employeeRefId: data.employeeId },
            { email: task.employee.email }
          ]
        }
      });

      if (recipientUser) {
        const priorityEmoji = task.priority === 'URGENT' ? '🚨 [URGENT]' : task.priority === 'HIGH' ? '⚡ [HIGH]' : '📋';
        await notificationService.createAndDispatch({
          recipientId: recipientUser.id,
          type: NotificationType.WORKFLOW,
          title: `${priorityEmoji} New Task Assigned: ${task.title}`,
          message: `You have been assigned a ${task.priority.toLowerCase()} priority task: "${task.title}". ${task.dueDate ? `Due date: ${new Date(task.dueDate).toLocaleDateString()}` : ''}`,
          resource: 'EmployeeTask',
          resourceId: task.id,
          href: `/portal/tasks/${task.id}`,
          metadata: {
            taskId: task.id,
            priority: task.priority,
            department: task.department
          }
        });
      }
    } catch (notifErr) {
      console.warn('[EmployeeService.createTask] Notification error:', notifErr);
    }

    return task;
  },

  async updateTask(id: string, data: {
    actorId: string;
    title?: string;
    description?: string;
    priority?: TaskPriority;
    status?: TaskStatus;
    dueDate?: string;
    completedAt?: string | Date | null;
    proofUrl?: string | null;
    proofFileName?: string | null;
    proofNotes?: string | null;
    submittedAt?: string | Date | null;
    validatedBy?: string | null;
    validationNotes?: string | null;
    notes?: string;
  }) {
    const actor = await employeesService.getDepartmentActor(data.actorId);
    const existing = await prisma.employeeTask.findUnique({
      where: { id },
      include: { employee: true }
    });

    if (!existing) {
      throw new NotFoundError('Task not found');
    }

    if (actor.operator) {
      if (!actor.employeeRefId || existing.employeeId !== actor.employeeRefId) throw new ForbiddenError('You can update only tasks assigned to you.');
      const allowedFields = new Set(['actorId', 'status', 'proofUrl', 'proofFileName', 'proofNotes', 'submittedAt', 'notes']);
      if (Object.keys(data).some((key) => !allowedFields.has(key))) throw new ForbiddenError('Workers may update task progress and submit proof only.');
      if (data.status && data.status !== TaskStatus.IN_PROGRESS && data.status !== TaskStatus.UNDER_REVIEW) throw new ForbiddenError('Workers can start a task or submit it for review; a supervisor must complete or reject it.');
    } else if (!actor.global) {
      if (!actor.supervisor || existing.employee.departmentId !== actor.assignedDepartmentId) throw new ForbiddenError('You can manage tasks only in your assigned department.');
    }

    const updateData: Prisma.EmployeeTaskUpdateInput = {
      title: data.title,
      description: data.description,
      priority: data.priority,
      status: data.status,
      notes: data.notes
    };

    if (data.proofUrl !== undefined) updateData.proofUrl = data.proofUrl;
    if (data.proofFileName !== undefined) updateData.proofFileName = data.proofFileName;
    if (data.proofNotes !== undefined) updateData.proofNotes = data.proofNotes;
    if (data.validatedBy !== undefined) updateData.validatedBy = data.validatedBy;
    if (data.validationNotes !== undefined) updateData.validationNotes = data.validationNotes;

    if (data.submittedAt !== undefined) {
      updateData.submittedAt = data.submittedAt ? new Date(data.submittedAt) : null;
    } else if (data.status === TaskStatus.UNDER_REVIEW && !existing.submittedAt) {
      updateData.submittedAt = new Date();
    }

    if (data.dueDate !== undefined) {
      updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    }

    if (data.status === TaskStatus.COMPLETED && !data.completedAt) {
      updateData.completedAt = new Date();
    } else if (data.status && data.status !== TaskStatus.COMPLETED) {
      updateData.completedAt = null;
    }

    const task = await prisma.employeeTask.update({
      where: { id },
      data: updateData,
      include: { employee: true }
    });

    // If submitted for review -> Notify HR / Admins
    if (data.status === TaskStatus.UNDER_REVIEW && existing.status !== TaskStatus.UNDER_REVIEW) {
      try {
        await notificationService.notifyRoles({
          roles: ['admin', 'hr', 'hr_manager', 'department_head'],
          type: NotificationType.APPROVAL_REQUIRED,
          title: `Task Proof Submitted for Validation: ${task.title}`,
          message: `${task.employee.firstName} ${task.employee.lastName} completed and uploaded proof for "${task.title}". Please validate.`,
          resource: 'EmployeeTask',
          resourceId: task.id,
          href: `/hr/tasks?taskId=${task.id}`,
          metadata: {
            taskId: task.id,
            employeeName: `${task.employee.firstName} ${task.employee.lastName}`
          }
        });
      } catch (err) {
        console.warn('[EmployeeService.updateTask] Review notification error:', err);
      }
    }

    // If validated as completed or rejected -> Notify Employee
    if ((data.status === TaskStatus.COMPLETED || data.status === TaskStatus.REJECTED) && existing.status !== data.status) {
      try {
        const recipientUser = await prisma.user.findFirst({
          where: {
            OR: [
              { employeeRefId: task.employeeId },
              { email: task.employee.email }
            ]
          }
        });

        if (recipientUser) {
          const isCompleted = data.status === TaskStatus.COMPLETED;
          await notificationService.createAndDispatch({
            recipientId: recipientUser.id,
            type: isCompleted ? NotificationType.APPROVED : NotificationType.CHANGES_REQUESTED,
            title: isCompleted ? `Task Approved & Completed: ${task.title}` : `Task Proof Rejected / Needs Revision: ${task.title}`,
            message: isCompleted
              ? `HR/Admin validated your submission for "${task.title}". Task is now marked completed.`
              : `Your proof submission for "${task.title}" was rejected. Notes: ${data.validationNotes || 'Please review and re-submit.'}`,
            resource: 'EmployeeTask',
            resourceId: task.id,
            href: `/portal/tasks/${task.id}`,
            metadata: {
              taskId: task.id,
              status: data.status
            }
          });
        }
      } catch (err) {
        console.warn('[EmployeeService.updateTask] Result notification error:', err);
      }
    }

    return task;
  },
  async deleteTask(id: string, actorId: string) {
    const actor = await employeesService.getDepartmentActor(actorId);
    const task = await prisma.employeeTask.findUnique({ where: { id }, include: { employee: { select: { departmentId: true } } } });
    if (!task) throw new NotFoundError('Task not found.');
    if (!actor.global && (!actor.supervisor || task.employee.departmentId !== actor.assignedDepartmentId)) throw new ForbiddenError('You can delete tasks only in your assigned department.');
    await prisma.employeeTask.delete({ where: { id } });
    return { success: true };
  },

  // 8. ATTENDANCE APIS
  async getEmployeeAttendance(employeeIdOrUserId: string, month?: number, year?: number) {
    // Resolve employeeId if userId was passed
    let resolvedEmployeeId = employeeIdOrUserId;
    const empCheck = await prisma.employee.findUnique({ where: { id: employeeIdOrUserId } });
    if (!empCheck) {
      const userCheck = await prisma.user.findUnique({ where: { id: employeeIdOrUserId } });
      if (userCheck?.employeeRefId) {
        resolvedEmployeeId = userCheck.employeeRefId;
      }
    }

    const where: Prisma.AttendanceWhereInput = { employeeId: resolvedEmployeeId };
    if (month && year) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59);
      where.date = { gte: start, lte: end };
    }

    const records = await prisma.attendance.findMany({
      where,
      orderBy: { date: 'desc' }
    });

    // Summary calculation
    const summary = {
      present: records.filter(r => r.status === AttendanceStatus.PRESENT).length,
      absent: records.filter(r => r.status === AttendanceStatus.ABSENT).length,
      leaveSick: records.filter(r => r.status === AttendanceStatus.LEAVE_SICK).length,
      leaveCasual: records.filter(r => r.status === AttendanceStatus.LEAVE_CASUAL).length,
      leavePaid: records.filter(r => r.status === AttendanceStatus.LEAVE_PAID).length,
      leaveUnpaid: records.filter(r => r.status === AttendanceStatus.LEAVE_UNPAID).length,
      halfDay: records.filter(r => r.status === AttendanceStatus.HALF_DAY).length,
      totalRecorded: records.length
    };

    return { records, summary };
  },

  async markAttendance(data: {
    employeeId: string;
    date: string;
    status: AttendanceStatus;
    checkIn?: string;
    checkOut?: string;
    workHours?: number;
    notes?: string;
    markedBy?: string;
  }) {
    let resolvedEmployeeId = data.employeeId;
    const empCheck = await prisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!empCheck) {
      const userCheck = await prisma.user.findUnique({ where: { id: data.employeeId } });
      if (userCheck?.employeeRefId) {
        resolvedEmployeeId = userCheck.employeeRefId;
      }
    }

    const dateObj = new Date(data.date);
    const formattedDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());

    const attendance = await prisma.attendance.upsert({
      where: {
        employeeId_date: {
          employeeId: resolvedEmployeeId,
          date: formattedDate
        }
      },
      create: {
        employeeId: resolvedEmployeeId,
        date: formattedDate,
        status: data.status,
        checkIn: data.checkIn ? new Date(data.checkIn) : null,
        checkOut: data.checkOut ? new Date(data.checkOut) : null,
        workHours: data.workHours ? new Prisma.Decimal(data.workHours) : null,
        notes: data.notes,
        markedBy: data.markedBy
      },
      update: {
        status: data.status,
        checkIn: data.checkIn ? new Date(data.checkIn) : undefined,
        checkOut: data.checkOut ? new Date(data.checkOut) : undefined,
        workHours: data.workHours ? new Prisma.Decimal(data.workHours) : undefined,
        notes: data.notes,
        markedBy: data.markedBy
      }
    });

    return attendance;
  },

  // 9. PAY SLIP APIS
  async getEmployeePaySlips(employeeId: string) {
    const slips = await prisma.paySlip.findMany({
      where: { employeeId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }]
    });
    return slips;
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
    status?: PaySlipStatus;
    notes?: string;
  }) {
    const basic = Number(data.basicSalary) || 0;
    const hra = Number(data.hra) || 0;
    const allowances = Number(data.allowances) || 0;
    const bonus = Number(data.bonus) || 0;
    const grossPay = basic + hra + allowances + bonus;

    const pf = Number(data.pfDeduction) || 0;
    const tax = Number(data.taxDeduction) || 0;
    const other = Number(data.otherDeduction) || 0;
    const totalDeductions = pf + tax + other;

    const netPay = grossPay - totalDeductions;

    const start = new Date(data.year, data.month - 1, 1);
    const end = new Date(data.year, data.month, 0);

    const slip = await prisma.paySlip.upsert({
      where: {
        employeeId_month_year: {
          employeeId: data.employeeId,
          month: data.month,
          year: data.year
        }
      },
      create: {
        employeeId: data.employeeId,
        month: data.month,
        year: data.year,
        payPeriodStart: start,
        payPeriodEnd: end,
        basicSalary: new Prisma.Decimal(basic),
        hra: new Prisma.Decimal(hra),
        allowances: new Prisma.Decimal(allowances),
        bonus: new Prisma.Decimal(bonus),
        grossPay: new Prisma.Decimal(grossPay),
        pfDeduction: new Prisma.Decimal(pf),
        taxDeduction: new Prisma.Decimal(tax),
        otherDeduction: new Prisma.Decimal(other),
        netPay: new Prisma.Decimal(netPay),
        status: data.status || PaySlipStatus.GENERATED,
        notes: data.notes
      },
      update: {
        basicSalary: new Prisma.Decimal(basic),
        hra: new Prisma.Decimal(hra),
        allowances: new Prisma.Decimal(allowances),
        bonus: new Prisma.Decimal(bonus),
        grossPay: new Prisma.Decimal(grossPay),
        pfDeduction: new Prisma.Decimal(pf),
        taxDeduction: new Prisma.Decimal(tax),
        otherDeduction: new Prisma.Decimal(other),
        netPay: new Prisma.Decimal(netPay),
        status: data.status || PaySlipStatus.GENERATED,
        notes: data.notes
      }
    });

    return slip;
  },

  // 10. EMPLOYEE DOCUMENTS APIS
  async getEmployeeDocuments(employeeId: string) {
    const docs = await prisma.employeeDocument.findMany({
      where: { employeeId },
      orderBy: { uploadedAt: 'desc' }
    });
    return docs;
  },

  async addEmployeeDocument(data: {
    employeeId: string;
    title: string;
    category: string;
    fileUrl: string;
    fileSize?: number;
    mimeType?: string;
  }) {
    const doc = await prisma.employeeDocument.create({
      data: {
        employeeId: data.employeeId,
        title: data.title,
        category: data.category,
        fileUrl: data.fileUrl,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        verified: false
      }
    });
    return doc;
  },

  async deleteEmployeeDocument(id: string) {
    await prisma.employeeDocument.delete({ where: { id } });
    return { success: true };
  },

  async resetEmployeePassword(employeeId: string, newPassword: string) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { userAccounts: { select: { id: true, email: true } } }
    });
    if (!employee) throw new NotFoundError('Employee not found');

    const hashedPassword = await argon2.hash(newPassword, { type: argon2.argon2id });
    const normalizedEmail = employee.email.trim().toLowerCase();

    let user = employee.userAccounts && employee.userAccounts.length > 0 ? employee.userAccounts[0] : null;
    if (!user) {
      user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    }

    if (user) {
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          initialPassword: newPassword,
          mustChangePassword: true,
          employeeRefId: employee.id,
          employeeId: employee.employeeCode
        }
      });
      return { userId: updatedUser.id, email: updatedUser.email, tempPassword: newPassword };
    } else {
      const newUser = await prisma.user.create({
        data: {
          email: normalizedEmail,
          firstName: employee.firstName,
          lastName: employee.lastName,
          name: `${employee.firstName} ${employee.lastName}`.trim(),
          password: hashedPassword,
          role: 'employee',
          employeeRefId: employee.id,
          employeeId: employee.employeeCode,
          phone: employee.phone || null,
          title: employee.designation || employee.role || 'Employee',
          initialPassword: newPassword,
          mustChangePassword: true,
          onboardingCompleted: false
        }
      });
      return { userId: newUser.id, email: newUser.email, tempPassword: newPassword };
    }
  },

  async getEmployeeScoreSnapshots(employeeId: string, limit = 12) {
    return prisma.employeeScoreSnapshot.findMany({
      where: { employeeId },
      orderBy: { calculatedAt: 'desc' },
      take: limit,
      include: {
        policy: true
      }
    });
  }
};
