import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as pactum from 'pactum';

// How to open test prisma studio
// npx dotenv -e .env.test -- prisma studio

// How to open dev prisma studio
// npx dotenv -e .env -- prisma studio

type PactumSpec = {
  get(url: string): PactumSpec;
  post(url: string): PactumSpec;
  withHeaders(body: Record<string, unknown>): PactumSpec;
  withBody(body: Record<string, unknown>): PactumSpec;
  expectStatus(status: number): PactumSpec;
  inspect(): PactumSpec;
  stores(name: string, path: string): PactumSpec;
};

type Pactum = {
  spec(): PactumSpec;
  request: {
    setBaseUrl(url: string): void;
  };
};

const pactumTyped = pactum as unknown as Pactum;

const PORT = 3002;
describe('AppController (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;

  beforeAll(async () => {
    const appModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = appModule.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
    await app.listen(PORT);
    prismaService = app.get(PrismaService);
    await prismaService.cleanDatabase();
    pactumTyped.request.setBaseUrl(`http://localhost:${PORT}`);
  });

  describe('Test Auth', () => {
    describe('Register', () => {
      it('should register a user', () => {
        pactumTyped
          .spec()
          .post('/auth/register')
          .withBody({
            email: 'phamthanhtu.9x@gmail.com',
            password: 'Admin@123',
          })
          .expectStatus(201)
          .inspect();
      });
      it('should show error with invalid email format', () => {
        pactumTyped
          .spec()
          .post('/auth/register')
          .withBody({
            email: 'phamthanhtu.9x@gmail',
            password: 'Admin@123',
          })
          .expectStatus(201)
          .inspect();
      });
      it('should show error if password is empty', () => {
        pactumTyped
          .spec()
          .post('/auth/register')
          .withBody({
            email: 'phamthanhtu.9x@gmail',
            password: '',
          })
          .expectStatus(201)
          .inspect();
      });
    });

    describe('Login', () => {
      it('should login', () => {
        pactumTyped
          .spec()
          .post('/auth/login')
          .withBody({
            email: 'phamthanhtu.9x@gmail.com',
            password: 'Admin@123',
          })
          .expectStatus(201)
          .inspect()
          .stores('accessToken', 'accessToken');
      });
    });
  });

  describe('User', () => {
    describe('Get detail user', () => {
      it('Should get detail user', () => {
        pactumTyped
          .spec()
          .get('/users/me')
          .withHeaders({
            Authorization: 'Bearer $S{accessTokenw}',
          })
          .expectStatus(200)
          .inspect();
      });
    });
  });

  describe('Tour', () => {
    describe('Insert tour', () => {});
    describe('Get all tours', () => {});
    describe('Get tour by id', () => {});
    describe('Update tour by id', () => {});
    describe('Delete tour by id', () => {});
  });

  afterAll(async () => {
    await app.close();
  });

  it.todo('should pass');
});
