require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const buscaRoutes = require('./routes/busca');
const empresasRoutes = require('./routes/empresas');
const enviosRoutes = require('./routes/envios');
const crawlerRoutes = require('./routes/crawler');
const crawlerGoogleRoutes = require('./routes/crawlerGoogle');
const dashboardRoutes = require('./routes/dashboard');
const curriculoRoutes = require('./routes/curriculo');
const emailTextoRoutes = require('./routes/emailTexto');
const emailAssuntoRoutes = require('./routes/emailAssunto');
const promptsRoutes = require('./routes/prompts');
const vagasRoutes = require('./routes/vagas');
const vagaEmailTextoRoutes = require('./routes/vagaEmailTexto');
const vagaEmailAssuntoRoutes = require('./routes/vagaEmailAssunto');

app.use('/busca', buscaRoutes);
app.use('/empresas', empresasRoutes);
app.use('/envios', enviosRoutes);
app.use('/crawler', crawlerRoutes);
app.use('/crawler/google', crawlerGoogleRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/curriculo', curriculoRoutes);
app.use('/email-texto', emailTextoRoutes);
app.use('/email-assunto', emailAssuntoRoutes);
app.use('/prompts', promptsRoutes);
app.use('/vagas', vagasRoutes);
app.use('/vaga-email-texto', vagaEmailTextoRoutes);
app.use('/vaga-email-assunto', vagaEmailAssuntoRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
