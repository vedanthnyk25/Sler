import express from 'express';
import { json } from 'body-parser';
import { router } from './routes';

const app = express();

app.use(json());
app.use('/api', router);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
