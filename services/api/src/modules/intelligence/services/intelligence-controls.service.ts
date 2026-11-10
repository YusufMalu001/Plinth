import { Prisma, PrismaClient } from '@prisma/client';
import { config } from '../../../config';
import { prisma as defaultPrisma } from '../../../database';
import { ValidationError } from '../../../common/errors/AppError';
import { intelligenceProfiles } from '../intelligence.profiles';

export type IntelligenceControlInput = {
  globalPaused: boolean;
  providerPaused: boolean;
  schedulesPaused: boolean;
  eventTriggersPaused: boolean;
  notificationsPaused: boolean;
  pausedProfiles: string[];
};

const defaultState: IntelligenceControlInput = {
  globalPaused: false,
  providerPaused: false,
  schedulesPaused: false,
  eventTriggersPaused: false,
  notificationsPaused: false,
  pausedProfiles: [],
};

type ControlStateRow = IntelligenceControlInput & {
  id: string;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class IntelligenceControlsService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  async state() {
    // Raw SQL keeps the kill-switch path usable during rolling deployments
    // where an API pod can briefly run with the prior generated Prisma client.
    const rows = await this.db.$queryRaw<ControlStateRow[]>`
      SELECT "id", "globalPaused", "providerPaused", "schedulesPaused", "eventTriggersPaused",
             "notificationsPaused", "pausedProfiles", "updatedById", "createdAt", "updatedAt"
      FROM "intelligence_control_state"
      WHERE "id" = 'default'
      LIMIT 1
    `;
    return rows[0] ?? { id: 'default', ...defaultState, updatedById: null, createdAt: null, updatedAt: null };
  }

  async effective() {
    const state = await this.state();
    const pausedProfiles = [...new Set([...config.intelligence.disabledProfiles, ...state.pausedProfiles])];
    return {
      state,
      enabled: config.intelligence.enabled && !state.globalPaused,
      providerEnabled: config.intelligence.providerEnabled && !state.globalPaused && !state.providerPaused,
      schedulesEnabled: config.intelligence.schedulesEnabled && !state.globalPaused && !state.schedulesPaused,
      eventTriggersEnabled: config.intelligence.eventTriggersEnabled && !state.globalPaused && !state.eventTriggersPaused,
      notificationsEnabled: config.intelligence.notificationsEnabled && !state.globalPaused && !state.notificationsPaused,
      shadowMode: config.intelligence.shadowMode,
      pausedProfiles,
      infrastructure: {
        enabled: config.intelligence.enabled,
        providerEnabled: config.intelligence.providerEnabled,
        schedulesEnabled: config.intelligence.schedulesEnabled,
        eventTriggersEnabled: config.intelligence.eventTriggersEnabled,
        notificationsEnabled: config.intelligence.notificationsEnabled,
      },
    };
  }

  async replace(input: IntelligenceControlInput, actorId: string) {
    const validProfiles = new Set(intelligenceProfiles().map((profile) => profile.key));
    const pausedProfiles = [...new Set(input.pausedProfiles)];
    const invalid = pausedProfiles.filter((profile) => !validProfiles.has(profile));
    if (invalid.length) throw new ValidationError(`Unknown intelligence profile: ${invalid.join(', ')}.`);
    const profileArray = pausedProfiles.length
      ? Prisma.sql`ARRAY[${Prisma.join(pausedProfiles)}]::TEXT[]`
      : Prisma.sql`ARRAY[]::TEXT[]`;
    const rows = await this.db.$queryRaw<ControlStateRow[]>(Prisma.sql`
      INSERT INTO "intelligence_control_state" (
        "id", "globalPaused", "providerPaused", "schedulesPaused", "eventTriggersPaused",
        "notificationsPaused", "pausedProfiles", "updatedById", "createdAt", "updatedAt"
      ) VALUES (
        'default', ${input.globalPaused}, ${input.providerPaused}, ${input.schedulesPaused}, ${input.eventTriggersPaused},
        ${input.notificationsPaused}, ${profileArray}, ${actorId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("id") DO UPDATE SET
        "globalPaused" = EXCLUDED."globalPaused",
        "providerPaused" = EXCLUDED."providerPaused",
        "schedulesPaused" = EXCLUDED."schedulesPaused",
        "eventTriggersPaused" = EXCLUDED."eventTriggersPaused",
        "notificationsPaused" = EXCLUDED."notificationsPaused",
        "pausedProfiles" = EXCLUDED."pausedProfiles",
        "updatedById" = EXCLUDED."updatedById",
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "id", "globalPaused", "providerPaused", "schedulesPaused", "eventTriggersPaused",
                "notificationsPaused", "pausedProfiles", "updatedById", "createdAt", "updatedAt"
    `);
    return rows[0];
  }
}

export const intelligenceControlsService = new IntelligenceControlsService();
