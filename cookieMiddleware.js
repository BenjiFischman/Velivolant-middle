const cookieParser = require('cookie-parser');

const cookieMiddleware = cookieParser(process.env.COOKIE_SECRET);

module.exports = cookieMiddleware;
