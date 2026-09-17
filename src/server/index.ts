import { createApp } from "./app.js";

const PORT = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3001;

const app = createApp();
app.listen(PORT, () => {
  console.log(`Serveur PV Studio à l'écoute sur http://localhost:${PORT}`);
});
