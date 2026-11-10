import { Role } from '@prisma/client';
import { prisma } from '../../database';

export const authRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: {
        assignedDepartmentRef: { select: { id: true, name: true, code: true, isAssembly: true } },
        employeeRef: {
          include: {
            department: { select: { id: true, name: true, code: true, isAssembly: true } }
          }
        },
        userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }
      }
    });
  },

  findUserById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        assignedDepartmentRef: { select: { id: true, name: true, code: true, isAssembly: true } },
        employeeRef: {
          include: {
            department: { select: { id: true, name: true, code: true, isAssembly: true } }
          }
        },
        userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }
      }
    });
  },

  markLogin(userId: string) {
    return prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  },

  createSession(data: {
    id: string;
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return prisma.authSession.create({ data });
  },

  findSession(id: string) {
    return prisma.authSession.findUnique({
      where: { id },
      include: { user: { include: { userRoles: { include: { role: true } } } } }
    });
  },

  rotateSession(id: string, refreshTokenHash: string, expiresAt: Date) {
    return prisma.authSession.update({
      where: { id },
      data: { refreshTokenHash, expiresAt }
    });
  },

  revokeSession(id: string) {
    return prisma.authSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  },

  audit(data: {
    userId?: string;
    action: string;
    resourceId?: string;
    requestId: string;
    ipAddress?: string;
    before?: object;
    after?: object;
  }) {
    return prisma.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        resource: 'User',
        resourceId: data.resourceId,
        requestId: data.requestId,
        ipAddress: data.ipAddress,
        before: data.before,
        after: data.after
      }
    });
  },

  listUsers(skip: number, take: number) {
    return prisma.$transaction([
      prisma.user.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          employeeId: true,
          phone: true,
          department: true,
          title: true,
          dateOfHire: true,
          employeeStatus: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          userRoles: { include: { role: true } }
        }
      }),
      prisma.user.count()
    ]);
  },

  createUser(data: { email: string; name?: string; password: string; role: Role; roleDefinitionId?: string }) {
    const userData = { email: data.email, name: data.name, password: data.password, role: data.role };
    return prisma.user.create({ data: { ...userData, email: data.email.toLowerCase() } });
  },

  updateUserStatus(id: string, isActive: boolean) {
    return prisma.user.update({ where: { id }, data: { isActive } });
  },

  updateUserRole(id: string, role: Role) {
    return prisma.user.update({ where: { id }, data: { role } });
  },

  async updateUserRoleDefinition(id: string, roleId: string | null) {
    await prisma.userRole.deleteMany({ where: { userId: id } });
    if (roleId) await prisma.userRole.create({ data: { userId: id, roleId } });
    return prisma.user.findUnique({ where: { id }, include: { userRoles: { include: { role: true } } } });
  },

  updateUser(id: string, data: Partial<{ firstName: string; lastName: string; email: string }>) {
    return prisma.user.update({ where: { id }, data });
  },

  updateUserPassword(id: string, password: string, mustChangePassword: boolean = false, initialPassword?: string) {
    return prisma.user.update({
      where: { id },
      data: {
        password,
        mustChangePassword,
        ...(initialPassword ? { initialPassword } : {})
      },
      include: {
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
    });
  }
};
