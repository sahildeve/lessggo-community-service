import { communitySwaggerDocs } from '../docs/community.swagger.js';
import { directChatSwaggerDocs } from '../docs/directChat.swagger.js';
import { notificationSwaggerDocs } from '../docs/notification.swagger.js';

const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Community Service API',
    version: '1.0.0',
    description: 'Community & Direct Chat Service for LetsGoo App',
  },
  servers: [
    {
      url: process.env.API_URL || 'http://localhost:3004',
      description: 'Server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  paths: {
    ...communitySwaggerDocs,
    ...directChatSwaggerDocs,
    ...notificationSwaggerDocs,
  },
};

export default swaggerSpec;