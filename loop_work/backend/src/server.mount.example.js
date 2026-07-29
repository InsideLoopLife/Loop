'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const betaAccessRoutes = require('./routes/betaAccess.routes');
const accountPurgeRoutes = require('./routes/accountPurge.routes');
const securityAdminRoutes = require('./routes/securityAdmin.routes');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.APP_URL || 'https://insideloop.life', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'Inside LOOP Stage 2 API', domain: 'insideloop.life' });
});

app.use('/api/beta', betaAccessRoutes);
app.use('/api/account', accountPurgeRoutes);
app.use('/api/admin/security', securityAdminRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({ error: err.message || 'Something went wrong.' });
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`Inside LOOP Stage 2 API running on ${port}`));
