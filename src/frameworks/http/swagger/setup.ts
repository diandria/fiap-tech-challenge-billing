import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';
import path from 'path';

// __dirname is src/frameworks/http/swagger in development and the dist
// equivalent in production; both reach the route files the same way.
const routesGlob = path.join(__dirname, '../routes/*.{ts,js}');

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Billing Service',
      version: '1.0.0',
      description: `Budgets and payments of the car repair shop service orders.

The service generates the budget of a service order, records the customer's decision and charges the approved budget through Mercado Pago. It talks to the OS Service only through the saga queues; the routes below are the ones people and the payment provider call.

## Authentication

- **Customers** use the token issued at \`POST /auth/cpf\` (served by the authentication function behind the API Gateway).
- **Staff** use the token issued at \`POST /auth/login\` on the OS Service.

Both tokens are validated here with the same signing secret; no call to another service is needed.`,
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Staff token, issued by POST /auth/login on the OS Service.',
        },
        customerBearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Customer token, issued by the function at POST /auth/cpf.',
        },
      },
    },
  },
  apis: [routesGlob],
};

export function buildSwaggerSpec(): object {
  return swaggerJsdoc(options) as object;
}

export function setupSwagger(app: Application): void {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(buildSwaggerSpec()));
}
