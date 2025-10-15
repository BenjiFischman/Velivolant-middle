import { graphqlHTTP } from 'express-graphql';
import { Request, Response } from 'express';
import schema from './schema';
import resolvers from './resolvers';
import logger from '../logger/winstonConfig';
import { GraphQLContext } from '../types/graphql';

/**
 * Create GraphQL middleware for Express (TypeScript)
 * Uses express-graphql (lightweight, no Apollo dependencies)
 */

export function createGraphQLMiddleware() {
  return graphqlHTTP((req: Request, res: Response) => {
    const context: GraphQLContext = {
      user: (req as any).user, // From auth middleware
      req,
    };

    return {
      schema,
      rootValue: resolvers,
      context,

      // Enable GraphiQL playground in development
      graphiql: process.env.NODE_ENV !== 'production' ? {
        headerEditorEnabled: true,
      } : false,

      // Pretty print in development
      pretty: process.env.NODE_ENV !== 'production',

      // Custom error formatter
      customFormatErrorFn: (error: any) => {
        logger.error('GraphQL error', {
          message: error.message,
          path: error.path,
          extensions: error.extensions,
        });

        // Don't expose internal errors in production
        if (process.env.NODE_ENV === 'production') {
          return {
            message: error.message,
            extensions: {
              code: error.extensions?.code,
            },
          };
        }

        return {
          message: error.message,
          locations: error.locations,
          path: error.path,
          extensions: error.extensions,
        };
      },
    };
  });
}

