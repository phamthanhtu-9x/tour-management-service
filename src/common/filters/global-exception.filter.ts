// src/common/filters/global-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch() // Để trống để bắt TOÀN BỘ ngoại lệ xảy ra trong ứng dụng
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // 1. Phân loại cấu trúc Status Code
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // 2. Phân tách và chuẩn hóa Message/Details dựa trên nguồn lỗi
    let message = 'Internal Server Error';
    let details: any = null;

    if (exception instanceof HttpException) {
      const resResponse = exception.getResponse();

      if (typeof resResponse === 'object' && resResponse !== null) {
        // Trường hợp lỗi từ ValidationPipe (class-validator) hoặc BadRequest chuẩn của Nest
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        message = (resResponse as any).message || exception.message;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        details = (resResponse as any).error || null;

        // Nếu bản thân 'message' từ ValidationPipe là một mảng, hãy đưa nó vào 'details'
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (Array.isArray((resResponse as any).message)) {
          message = 'Validation failed';
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          details = (resResponse as any).message;
        }
      } else {
        message = resResponse;
      }
    } else if (exception instanceof Error) {
      // Lỗi hệ thống phát sinh (Crash code, lỗi logic, lỗi DB Prisma...)
      message = exception.message;
    }

    // 3. Log lỗi chi tiết ở Server để phục vụ việc Debug/Tracking
    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} - Crash Error: ${message}`,
        exception instanceof Error ? exception.stack : '',
      );
    } else {
      this.logger.warn(
        `[${request.method}] ${request.url} - Client Error: ${JSON.stringify(message)}`,
      );
    }

    // 4. Trả về JSON chuẩn hóa duy nhất cho Client
    response.status(status).json({
      //   success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      //   path: request.url,
      //   method: request.method,
      message: message,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      details: details,
    });
  }
}
