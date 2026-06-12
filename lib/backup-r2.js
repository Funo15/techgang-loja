// Backup offsite para Cloudflare R2 (API compatível com S3).
// Se as credenciais não estiverem definidas, regista no log e sai
// silenciosamente — nunca rebenta o fluxo de backup local.

const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { logNegocio } = require('./logger');

const RETER_DIAS = 14;
const PREFIXO = 'backups/';

function criarCliente() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null;
  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY }
  });
}

async function enviarParaR2(caminhoFicheiro) {
  const bucket = process.env.R2_BUCKET;
  const cliente = criarCliente();

  if (!cliente || !bucket) {
    console.log('[backup-r2] não configurado — a saltar envio offsite');
    return false;
  }

  const nome = path.basename(caminhoFicheiro);
  const key = PREFIXO + nome;
  const conteudo = fs.readFileSync(caminhoFicheiro);

  await cliente.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: conteudo,
    ContentType: 'application/octet-stream'
  }));

  logNegocio('backup_r2_enviado', { nome });
  console.log(`[backup-r2] enviado: ${key}`);

  // Limpar backups com mais de 14 dias no R2
  await limparR2Antigos(cliente, bucket);
  return true;
}

async function limparR2Antigos(cliente, bucket) {
  const limite = Date.now() - RETER_DIAS * 24 * 60 * 60 * 1000;
  const lista = await cliente.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: PREFIXO
  }));

  const antigos = (lista.Contents || []).filter(obj => new Date(obj.LastModified).getTime() < limite);
  for (const obj of antigos) {
    await cliente.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
    console.log(`[backup-r2] removido antigo: ${obj.Key}`);
  }
}

module.exports = { enviarParaR2 };
