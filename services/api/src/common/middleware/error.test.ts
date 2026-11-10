import { errorHandler } from './error';

describe('errorHandler sales order validation responses', () => {
  const makeResponse = () => {
    const response: any = { status: jest.fn(), json: jest.fn() };
    response.status.mockReturnValue(response);
    return response;
  };

  it('reports a missing pro forma table as a database setup issue, not a user input error', () => {
    const response = makeResponse();
    const error: any = new Error('Invalid `$queryRaw()` invocation: relation "sales_ar_proformas" does not exist');
    error.name = 'PrismaClientKnownRequestError';
    error.code = 'P2010';
    error.meta = { code: '42P01' };

    errorHandler(error, { id: 'request-1' } as any, response, jest.fn());

    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'DATABASE_MIGRATION_REQUIRED' }),
    }));
  });

  it('returns a field-level error for missing Prisma input arguments', () => {
    const response = makeResponse();
    const error: any = new Error('Invalid `prisma.salesOrder.create()` invocation: Argument `postalCode` is missing.');
    error.name = 'PrismaClientValidationError';

    errorHandler(error, { id: 'request-2' } as any, response, jest.fn());

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'postalCode', message: 'Missing required field: postalCode.' }],
      }),
    }));
  });
});
