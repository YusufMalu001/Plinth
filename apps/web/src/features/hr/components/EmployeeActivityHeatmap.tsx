'use client';

import React, { useMemo } from 'react';
import { AttendanceDto, EmployeeTaskDto } from '@plinth/types';


// Maps a day's combined activity to a rating 0–5
// 0 = no data, 1 = minimal, 5 = excellent
function computeRating(attendance: AttendanceDto | undefined, completedTasks: number): number {
 if (!attendance && completedTasks === 0) return 0;

 let score = 0;

 // Attendance contribution (0–3)
 if (attendance) {
 switch (attendance.status) {
 case 'PRESENT': score += 3; break;
 case 'HALF_DAY': score += 2; break;
 case 'LEAVE_PAID':
 case 'LEAVE_CASUAL':
 case 'LEAVE_SICK': score += 1; break;
 case 'HOLIDAY': score += 1; break;
 case 'ABSENT':
 case 'LEAVE_UNPAID': score += 0; break;
 default: score += 0;
 }
 }

 // Task contribution (0–2): 1 task → +1, 2+ tasks → +2
 score += Math.min(completedTasks, 2);

 // Clamp 0–5, but if attendance present and tasks 0 ensure at least 1
 if (attendance && score === 0) score = 1;
 return Math.min(score, 5) as 0 | 1 | 2 | 3 | 4 | 5;
}

// Tailwind classes per rating using theme primary colour shades
// light: var(--accent-blue) palette; dark: var(--accent-hover) palette
const CELL_CLASSES: Record<number, string> = {
 0: 'bg-muted ',
 1: 'bg-tone-blue-bg ',
 2: 'bg-tone-blue-bg ',
 3: 'bg-tone-blue-bg ',
 4: 'bg-tone-blue-bg ',
 5: 'bg-tone-blue-bg ',
};

const RATING_LABEL: Record<number, string> = {
 0: 'No activity',
 1: 'Minimal (1/5)',
 2: 'Low (2/5)',
 3: 'Moderate (3/5)',
 4: 'Good (4/5)',
 5: 'Excellent (5/5)',
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_ROW_LABELS: Record<number, string> = { 1: 'Mon', 3: 'Wed', 5: 'Fri' };

interface Props {
 attendances: AttendanceDto[];
 tasks: EmployeeTaskDto[];
}

export function EmployeeActivityHeatmap({ attendances, tasks }: Props) {
 // Build a 52-week grid ending today
 const { weeks, monthHeaders, totalRated } = useMemo(() => {
 const today = new Date();
 today.setHours(0, 0, 0, 0);

 // Start from 52 weeks ago, aligned to Sunday
 const start = new Date(today);
 start.setDate(today.getDate() - 364);
 // Rewind to the nearest Sunday
 start.setDate(start.getDate() - start.getDay());

 // Index attendance by YYYY-MM-DD
 const attendanceMap = new Map<string, AttendanceDto>();
 for (const a of attendances) {
 const key = a.date.slice(0, 10);
 attendanceMap.set(key, a);
 }

 // Index completed tasks by completed date
 const taskMap = new Map<string, number>();
 for (const t of tasks) {
 if (t.status === 'COMPLETED' && t.completedAt) {
 const key = t.completedAt.slice(0, 10);
 taskMap.set(key, (taskMap.get(key) ?? 0) + 1);
 }
 }

 // Build columns (weeks), each column = 7 days Sun→Sat
 const weeks: Array<Array<{ date: Date; rating: number; key: string; isFuture: boolean }>> = [];
 const monthHeaderMap = new Map<number, string>(); // weekIndex → month label

 const cursor = new Date(start);
 let lastSeenMonth = -1;
 let totalRated = 0;

 while (cursor <= today || cursor.getDay() !== 0) {
 const week: (typeof weeks)[0] = [];
 const weekIdx = weeks.length;

 for (let d = 0; d < 7; d++) {
 const dayDate = new Date(cursor);
 const isFuture = dayDate > today;
 const key = dayDate.toISOString().slice(0, 10);
 const rating = isFuture ? 0 : computeRating(attendanceMap.get(key), taskMap.get(key) ?? 0);
 if (!isFuture && rating > 0) totalRated++;

 // Track first week of each new month for header
 if (!isFuture && dayDate.getMonth() !== lastSeenMonth && d === 0) {
 monthHeaderMap.set(weekIdx, MONTH_LABELS[dayDate.getMonth()]);
 lastSeenMonth = dayDate.getMonth();
 }

 week.push({ date: dayDate, rating, key, isFuture });
 cursor.setDate(cursor.getDate() + 1);
 }
 weeks.push(week);
 if (cursor > today && cursor.getDay() === 0) break;
 }

 return { weeks, monthHeaders: monthHeaderMap, totalRated };
 }, [attendances, tasks]);

 const [tooltip, setTooltip] = React.useState<{ x: number; y: number; text: string } | null>(null);

 return (
 <div className="bg-card rounded-xl border border-border shadow-xs p-5 md:p-6 space-y-3">
 {/* Header */}
 <div className="flex items-center justify-between flex-wrap gap-2">
 <p className="text-sm font-bold text-foreground">
 {totalRated} active{' '}
 <span className="font-normal text-muted-foreground">day{totalRated !== 1 ? 's' : ''} in the last year</span>
 </p>
 <span className="text-[11px] text-muted-foreground font-medium">Activity rating 1–5</span>
 </div>

 {/* Grid */}
 <div className="overflow-x-auto pb-1">
 <div className="relative inline-flex flex-col gap-0 min-w-0">

 {/* Month labels row */}
 <div className="flex mb-1 ml-[26px]">
 {weeks.map((_, wi) => (
 <div key={wi} className="w-[11px] mr-[2px] flex-shrink-0">
 {monthHeaders.has(wi) && (
 <span className="text-[10px] font-medium text-ink-muted whitespace-nowrap leading-none">
 {monthHeaders.get(wi)}
 </span>
 )}
 </div>
 ))}
 </div>

 {/* Day rows (0=Sun … 6=Sat), render all 7 but only label Mon/Wed/Fri */}
 <div className="flex gap-[2px]">
 {/* Day-of-week labels column */}
 <div className="flex flex-col gap-[2px] mr-[4px] flex-shrink-0 w-[22px]">
 {[0, 1, 2, 3, 4, 5, 6].map((dow) => (
 <div key={dow} className="h-[10px] flex items-center justify-end">
 {DAY_ROW_LABELS[dow] && (
 <span className="text-[10px] font-medium text-ink-muted leading-none">
 {DAY_ROW_LABELS[dow]}
 </span>
 )}
 </div>
 ))}
 </div>

 {/* Week columns */}
 {weeks.map((week, wi) => (
 <div key={wi} className="flex flex-col gap-[2px] flex-shrink-0">
 {week.map((cell) => (
 <div
 key={cell.key}
 className={`w-[10px] h-[10px] rounded-[2px] cursor-default transition-opacity ${CELL_CLASSES[cell.rating]} ${cell.isFuture ? 'opacity-0 pointer-events-none' : ''}`}
 onMouseEnter={(e) => {
 const rect = (e.target as HTMLElement).getBoundingClientRect();
 const label = cell.date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
 setTooltip({
 x: rect.left + rect.width / 2,
 y: rect.top - 6,
 text: cell.rating === 0
 ? `No activity — ${label}`
 : `Rating ${cell.rating}/5 — ${RATING_LABEL[cell.rating]} — ${label}`,
 });
 }}
 onMouseLeave={() => setTooltip(null)}
 />
 ))}
 </div>
 ))}
 </div>
 </div>
 </div>

 {/* Legend */}
 <div className="flex items-center gap-2 mt-1">
 <span className="text-[11px] text-muted-foreground">Less</span>
 {[0, 1, 2, 3, 4, 5].map((r) => (
 <div
 key={r}
 className={`w-[11px] h-[11px] rounded-[2px] ${CELL_CLASSES[r]}`}
 title={RATING_LABEL[r]}
 />
 ))}
 <span className="text-[11px] text-muted-foreground">More</span>
 </div>

 {/* Tooltip — rendered as fixed overlay so it floats above the grid */}
 {tooltip && (
 <div
 className="fixed z-50 px-2.5 py-1.5 bg-foreground text-background text-[11px] font-medium rounded-md shadow-md pointer-events-none whitespace-nowrap"
 style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)' }}
 >
 {tooltip.text}
 </div>
 )}
 </div>
 );
}
