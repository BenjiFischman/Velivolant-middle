const session = require('express-session');

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  // store: MongoStore.create({
  //   mongoUrl: process.env.MONGODB_URI,
  //   ttl: 24 * 60 * 60, // Session TTL (1 day)
  // }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // Cookie max age (1 day)
    sameSite: 'strict',
  },
});

module.exports = sessionMiddleware;
