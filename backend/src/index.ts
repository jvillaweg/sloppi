import express from 'express';
import cors from 'cors';
import { sessionRouter } from './routes/session';
import { chatRouter } from './routes/chat';
import { actionsRouter } from './routes/actions';
import { testsRouter } from './routes/tests';
import { eventsRouter } from './routes/events';

const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/api', sessionRouter);
app.use('/api', chatRouter);
app.use('/api', actionsRouter);
app.use('/api', testsRouter);
app.use('/api', eventsRouter);

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
