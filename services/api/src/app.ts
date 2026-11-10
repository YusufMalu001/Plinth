import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { correlationId } from './common/middleware/correlationId';
import { requestLogger } from './common/middleware/logger';
import { errorHandler } from './common/middleware/error';
import { NotFoundError } from './common/errors/AppError';
import { isAllowedOrigin } from './common/middleware/trustedOrigin';

// Import Route Handlers
import healthRouter from './modules/health/health.routes';
import authRouter from './modules/auth/auth.routes';
import usersRouter from './modules/users/users.routes';
import employeesRouter from './modules/employees/employees.routes';
import inventoryRouter from './modules/inventory/inventory.routes';
import productionRouter from './modules/production/production.routes';
import salesRouter from './modules/sales/sales.routes';
import purchasesRouter from './modules/purchases/purchases.routes';
import goodsReceiptRouter from './modules/goods-receipt/goods-receipt.routes';
import financeRouter from './modules/finance/finance.routes';
import masterDataRouter from './modules/master-data/routes/master-data.routes';
import debitNotesRouter from './modules/debit-notes/debit-note.routes';
import accountsCoreRouter from './modules/accounts/accounts-core.routes';
import accountsApRouter from './modules/accounts/accounts-ap.routes';
import accountsArRouter from './modules/accounts/accounts-ar.routes';
import accountsExpenseRouter from './modules/accounts/accounts-expense.routes';
import eventsRouter from './modules/events/events.routes';
import bomRouter from './modules/bom/bom.routes';
import materialIssueRouter from './modules/material-issue/material-issue.routes';
import dashboardRouter from './modules/dashboard/dashboard.routes';
import calendarRouter from './modules/calendar/calendar.routes';
import wipRouter from './modules/wip/wip.routes';
import qcRouter from './modules/qc/qc.routes';
import lossManagementRouter from './modules/loss-management/loss-management.routes';
import assemblyRouter from './modules/assembly/assembly.routes';
import finishedGoodsRouter from './modules/finished-goods/fg-receipt.routes';
import fulfillmentRouter from './modules/fulfillment/fulfillment.routes';
import jobWorkRouter from './modules/job-work/job-work.routes';
import intelligenceRouter from './modules/intelligence/intelligence.routes';
import intelligenceMcpRouter from './modules/intelligence/intelligence.mcp.routes';

const app = express();

// Enable trust proxy for reverse proxies (e.g. Next.js API rewrites/proxies, Docker, load balancers)
app.set('trust proxy', 1);

// Security configurations
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    // GRN creation uses an idempotency key so a browser retry cannot create a
    // duplicate receipt. It must be allowed during the CORS preflight.
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id', 'Idempotency-Key']
  })
);

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(cookieParser());

// Set request correlation ID tracing
app.use(correlationId);

// Request Logger
app.use(requestLogger);

// API v1 Routing
const apiPrefix = `/api/${config.apiVersion}`;

app.use(apiPrefix, healthRouter);
// Keep the private service-credential route ahead of legacy `/:id` routers
// (for example BOM/material routes mounted at the API root). Those routers
// must never capture `/internal/intelligence/mcp` and invoke user JWT auth.
app.use(`${apiPrefix}/internal/intelligence/mcp`, intelligenceMcpRouter);
app.use(apiPrefix, authRouter);
app.use(apiPrefix, usersRouter);
app.use(apiPrefix, employeesRouter);
app.use(apiPrefix, dashboardRouter);
app.use(apiPrefix, calendarRouter);
app.use(apiPrefix, inventoryRouter);
app.use(apiPrefix, productionRouter);
app.use(apiPrefix, salesRouter);
app.use(`${apiPrefix}/fulfillment`, fulfillmentRouter);
app.use(`${apiPrefix}/purchases`, purchasesRouter);
app.use(`${apiPrefix}/goods-receipts`, goodsReceiptRouter);
app.use(`${apiPrefix}/finance`, financeRouter);
app.use(`${apiPrefix}/master-data`, masterDataRouter);
// Compatibility aliases for clients created before master-data was namespaced.
// The canonical endpoints remain /master-data/*, while these aliases prevent
// older product/material selectors from failing with a misleading 404.
app.use(apiPrefix, masterDataRouter);
app.use(apiPrefix, bomRouter);
// Material-issue routes must stay scoped to their own resource prefix. Mounting
// this router at `/api/v1` makes its `/:id` handler capture unrelated routes
// such as `/api/v1/debit-notes`, causing the literal "debit-notes" string to be
// looked up as a MaterialIssue id.
app.use(`${apiPrefix}/material-issues`, materialIssueRouter);
app.use(`${apiPrefix}/debit-notes`, debitNotesRouter);
app.use(`${apiPrefix}/accounts/expenses`, accountsExpenseRouter);
app.use(`${apiPrefix}/accounts/ap`, accountsApRouter);
app.use(`${apiPrefix}/accounts`, accountsArRouter);
app.use(`${apiPrefix}/accounts`, accountsCoreRouter);
app.use(`${apiPrefix}/events`, eventsRouter);
app.use(apiPrefix, wipRouter);
app.use(apiPrefix, qcRouter);
app.use(apiPrefix, lossManagementRouter);
app.use(`${apiPrefix}/assembly`, assemblyRouter);
app.use(`${apiPrefix}/fg`, finishedGoodsRouter);
app.use(`${apiPrefix}/job-work`, jobWorkRouter);
app.use(`${apiPrefix}/intelligence`, intelligenceRouter);
// Fallback for unmatched endpoints
app.use((req, _res, next) => {
  next(new NotFoundError(`Endpoint '${req.method} ${req.originalUrl}' does not exist`));
});

// Centralized error handling
app.use(errorHandler);

export default app;
