import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Loại bỏ trường thừa không định nghĩa trong DTO
      transform: true, // Tự động ép kiểu dữ liệu trong DTO
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // --- SWAGGER CONFIG ---
  const config = new DocumentBuilder()
    .setTitle('Poker Tour Management API')
    .setDescription('API docs')
    .setVersion('1.0')
    .addBearerAuth() // Thêm cấu hình Token JWT (ổ khóa Bảo mật trên giao diện UI)
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // --- SECURITY MIDDLEWARE ---
  app.use(helmet());
  app.enableCors();

  await app.listen(process.env.PORT ?? 3002);
}
bootstrap();
