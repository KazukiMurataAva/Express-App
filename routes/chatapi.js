const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const express = require('express');
const { OpenAIClient, AzureKeyCredential } = require('@azure/openai');
const cors = require('cors');

dotenv.config();

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// MySQL接続の設定
const dbConfig = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
};

// MySQLに接続
const pool = mysql.createPool(dbConfig);

// Expressのルート設定
app.get('/api', async (req, res) => {
  try {
    // データベースからデータを取得するクエリ
    const query = 'SELECT id, you, gpt FROM chat_history'; 

    // クエリの実行
    const [results] = await pool.query(query);

    // データベースの結果を利用してレスポンスを送信
    res.json(results);
  } catch (error) {
    console.error('Error executing MySQL query:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { inputText } = req.body;

    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: inputText },
    ];

    // 最後のメッセージの id を取得
    const getLastMessageIdQuery = 'SELECT id FROM chat_history ORDER BY id DESC LIMIT 1';
    const [lastMessageResult] = await pool.query(getLastMessageIdQuery);
    const lastMessageId = lastMessageResult[0]?.id || 0;

    // Azure OpenAI接続
    const client = new OpenAIClient(process.env.AZURE_OPENAI_ENDPOINT, new AzureKeyCredential(process.env.AZURE_OPENAI_KEY));
    const result = await client.getChatCompletions(process.env.DEPLOYMENT_ID, messages);
    const response = result.choices[0]?.message?.content || 'No response';

    // MySQLにデータを挿入
    const insertQuery = 'INSERT INTO chat_history (id, you, gpt) VALUES (?, ?, ?)';
    const [insertResult] = await pool.query(insertQuery, [lastMessageId + 1, inputText, response]); //SQLインジェクション対策は必要

    if (insertResult.affectedRows === 1) {
      console.log('Data inserted into MySQL database');
      res.json({ response, lastMessageId: lastMessageId + 1 });
    } else {
      console.error('MySQL insert error:', insertResult.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  } catch (error) {
    console.error('エラーが発生しました。', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
