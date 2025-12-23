// Arquivo: app.js
const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do PostgreSQL usando variáveis de ambiente
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
});

// Middleware para parsing de JSON
app.use(bodyParser.json());

// Inicialização do banco de dados
async function initDatabase() {
  try {
    const client = await pool.connect();
    
    // Cria a tabela eventos se não existir
    await client.query(`
      CREATE TABLE IF NOT EXISTS eventos (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        data TIMESTAMP NOT NULL,
        latitude DECIMAL(10, 7) NOT NULL,
        longitude DECIMAL(10, 7) NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Cria a tabela tipo_evento
    await client.query(`
      CREATE TABLE IF NOT EXISTS tipo_evento (
        id SERIAL PRIMARY KEY,
        descricao VARCHAR(255) NOT NULL,
        ativo BOOLEAN DEFAULT TRUE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Cria a tabela eventos_tipos (atualizada)
    await client.query(`
      CREATE TABLE IF NOT EXISTS eventos_tipos (
        id SERIAL PRIMARY KEY,
        evento_id INTEGER REFERENCES eventos(id) ON DELETE CASCADE,
        tipo_evento_id INTEGER REFERENCES tipo_evento(id),
        UNIQUE(evento_id, tipo_evento_id)
      );
    `);
    
    // Insere tipos de eventos padrão (se não existirem)
    const tiposExistentes = await client.query('SELECT COUNT(*) FROM tipo_evento');
    if (tiposExistentes.rows[0].count === '0') {
      await client.query(`
        INSERT INTO tipo_evento (descricao) VALUES 
          ('Sem Chuva'),
		  ('Chuva Fraca'),
          ('Chuva Forte'),
          ('Granizo'),
          ('Raios'),
		  ('Deslizamento'),
          ('Alagamento'),
		  ('Queda de Árvore'),
          ('Rio Transbordando'),
		  ('Neblina/Nevoeiro'),
		  ('Queimada'),
      ('Tornado');
      `);
    }
    
    console.log('Tabelas criadas com sucesso');
    client.release();
  } catch (err) {
    console.error('Erro ao inicializar o banco de dados:', err);
  }
}

// Classe para validação de dados
class Evento {
  constructor(dados) {
    this.eventos = dados.eventos;
    this.nome = dados.nome;
    this.data = dados.data;
    this.coordenadas = dados.coordenadas;
  }

  validar() {
    if (!this.eventos || !Array.isArray(this.eventos)) {
      return { valido: false, mensagem: 'Eventos deve ser um array' };
    }
    
    if (!this.nome || typeof this.nome !== 'string') {
      return { valido: false, mensagem: 'Nome é obrigatório e deve ser uma string' };
    }
    
    if (!this.data || !this.isValidISODate(this.data)) {
      return { valido: false, mensagem: 'Data deve ser um ISO8601 string válido' };
    }
    
    if (!this.coordenadas || 
        !this.coordenadas.hasOwnProperty('latitude') || 
        !this.coordenadas.hasOwnProperty('longitude')) {
      return { valido: false, mensagem: 'Coordenadas devem conter latitude e longitude' };
    }
    
    return { valido: true };
  }
  
  isValidISODate(dateString) {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }
}

// Endpoint para receber o JSON
app.post('/api/eventos', async (req, res) => {
  try {
    const dadosRecebidos = req.body;
    const evento = new Evento(dadosRecebidos);
    
    // Validar os dados recebidos
    const validacao = evento.validar();
    
    if (!validacao.valido) {
      return res.status(400).json({
        sucesso: false,
        mensagem: validacao.mensagem
      });
    }
    
    const client = await pool.connect();
    
    try {
      // Iniciar transação
      await client.query('BEGIN');
      
      // Inserir o evento principal
      const eventoResult = await client.query(
        `INSERT INTO eventos(nome, data, latitude, longitude) 
         VALUES($1, $2, $3, $4) RETURNING id`,
        [
          evento.nome, 
          evento.data, 
          evento.coordenadas.latitude, 
          evento.coordenadas.longitude
        ]
      );
      
      const eventoId = eventoResult.rows[0].id;
      
      // Para cada tipo de evento, buscar o tipo_evento_id correspondente
      for (const tipoEvento of evento.eventos) {
        const tipoResult = await client.query(
          'SELECT id FROM tipo_evento WHERE descricao = $1 AND ativo = true',
          [tipoEvento]
        );
        
        // Se o tipo de evento for encontrado, inserir na tabela eventos_tipos
        if (tipoResult.rows.length > 0) {
          const tipoEventoId = tipoResult.rows[0].id;
          await client.query(
            'INSERT INTO eventos_tipos(evento_id, tipo_evento_id) VALUES($1, $2)',
            [eventoId, tipoEventoId]
          );
        } else {
          // Se o tipo de evento não for encontrado, emitir um aviso
          console.warn(`Tipo de evento não encontrado: ${tipoEvento}`);
        }
      }
      
      // Finalizar transação
      await client.query('COMMIT');
      
      // Responder com sucesso
      return res.status(201).json({
        sucesso: true,
        mensagem: 'Evento recebido com sucesso',
        id: eventoId
      });
      
    } catch (dbError) {
      // Em caso de erro, reverter a transação
      await client.query('ROLLBACK');
      console.error('Erro na transação do banco de dados:', dbError);
      
      return res.status(500).json({
        sucesso: false,
        mensagem: 'Erro ao salvar os dados no banco de dados'
      });
    } finally {
      client.release();
    }
    
  } catch (erro) {
    console.error('Erro ao processar evento:', erro);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno do servidor'
    });
  }
});

// Endpoint para obter todos os eventos
app.get('/api/eventos', async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Consulta para obter todos os eventos com seus tipos
    const result = await client.query(`
      SELECT e.id, e.nome, e.data, e.latitude, e.longitude, e.timestamp,
             array_agg(te.descricao) as eventos
      FROM eventos e
      LEFT JOIN eventos_tipos et ON e.id = et.evento_id
      LEFT JOIN tipo_evento te ON et.tipo_evento_id = te.id
      GROUP BY e.id
      ORDER BY e.timestamp DESC
    `);
    
    client.release();
    
    // Formatar os dados para o formato esperado pelo cliente
    const eventosFormatados = result.rows.map(row => ({
      id: row.id,
      nome: row.nome,
      data: row.data,
      coordenadas: {
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude)
      },
      eventos: row.eventos || [],
      timestamp: row.timestamp
    }));
    
    res.json(eventosFormatados);
    
  } catch (erro) {
    console.error('Erro ao buscar eventos:', erro);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao buscar eventos do banco de dados'
    });
  }
});

// Endpoint para obter um evento específico por ID
app.get('/api/eventos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID inválido'
      });
    }
    
    const client = await pool.connect();
    
    // Consulta para obter o evento específico com seus tipos
    const result = await client.query(`
      SELECT e.id, e.nome, e.data, e.latitude, e.longitude, e.timestamp,
             array_agg(te.descricao) as eventos
      FROM eventos e
      LEFT JOIN eventos_tipos et ON e.id = et.evento_id
      LEFT JOIN tipo_evento te ON et.tipo_evento_id = te.id
      WHERE e.id = $1
      GROUP BY e.id
    `, [id]);
    
    client.release();
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Evento não encontrado'
      });
    }
    
    // Formatar os dados para o formato esperado pelo cliente
    const row = result.rows[0];
    const eventoFormatado = {
      id: row.id,
      nome: row.nome,
      data: row.data,
      coordenadas: {
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude)
      },
      eventos: row.eventos || [],
      timestamp: row.timestamp
    };
    
    res.json(eventoFormatado);
    
  } catch (erro) {
    console.error('Erro ao buscar evento:', erro);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao buscar evento do banco de dados'
    });
  }
});

// Endpoint para obter todos os tipos de eventos ativos
app.get('/api/tipos-eventos', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT id, descricao FROM tipo_evento WHERE ativo = true ORDER BY descricao');
    client.release();
    
    res.json(result.rows);
    
  } catch (erro) {
    console.error('Erro ao buscar tipos de eventos:', erro);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao buscar tipos de eventos do banco de dados'
    });
  }
});

// Iniciar o servidor
app.listen(PORT, async () => {
  await initDatabase();
  console.log(`Servidor rodando na porta ${PORT} com PostgreSQL`);
});

module.exports = app; // Para testes
