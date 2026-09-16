import { json } from 'body-parser';
import express from 'express';
import { router } from './routes.js';

const app = express();

app.use(json());
app.use('/api', router);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
