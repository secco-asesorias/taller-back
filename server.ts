import 'dotenv/config';
import app from './src/app';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend TallerSecco corriendo en puerto ${PORT}`);
});
