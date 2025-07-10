import {
  INestApplication,
  Logger,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const port = configService.get<number>('PORT') || 3000;

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  app.use(helmet());

  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'api/docs', 'probe'],
  });

  app.enableVersioning({
    type: VersioningType.URI,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('API Documentation')
    .setDescription('NestJS API with Swagger')
    .setVersion('1.0')
    .addBearerAuth()
    .build();


  const document = SwaggerModule.createDocument(
    app as INestApplication,
    swaggerConfig,
  );
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);
  logger.log(`🚀 Server running on: ${await app.getUrl()}`);
  logger.log(`📚 Swagger docs available at: http://localhost:${port}/api/docs`);
}

void bootstrap();
