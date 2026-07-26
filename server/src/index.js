require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const signalsRoutes = require('./routes/signals');
const watchlistRoutes = require('./routes/watchlist');
const positionsRoutes = require('./routes/positions');
const alertsRoutes = require('./routes/alerts');
const profileRoutes = require('./routes/profile');
const jobsRoutes = require('./routes/jobs');
const { startScheduler } = require('./jobs/scheduler');
const { generalLimiter } = require('./middleware/rateLimit');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());
app.use('/api', generalLimiter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/signals', signalsRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/positions', positionsRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/jobs', jobsRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`StockSense API listening on http://localhost:${port}`));

startScheduler();
