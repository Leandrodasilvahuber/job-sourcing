require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const buscaRoutes = require('./routes/busca');
const empresasRoutes = require('./routes/empresas');
const enviosRoutes = require('./routes/envios');

app.use('/busca', buscaRoutes);
app.use('/empresas', empresasRoutes);
app.use('/envios', enviosRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
