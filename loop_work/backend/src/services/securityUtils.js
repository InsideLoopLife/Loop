'use strict';

const crypto = require('crypto');

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function hashAccessCode(rawCode) {
  const pepper = process.env.BETA_ACCESS_CODE_PEPPER;
  if (!pepper || pepper.length < 24) {
    throw new Error('BETA_ACCESS_CODE_PEPPER must be set to a long random secret.');
  }
  const normalized = String(rawCode || '').trim().toUpperCase().replace(/\s+/g, '');
  return sha256(`${pepper}:${normalized}`);
}

function generateAccessCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 12; i += 1) {
    code += alphabet[crypto.randomInt(0, alphabet.length)];
    if (i === 3 || i === 7) code += '-';
  }
  return code;
}

function hashRequestValue(value) {
  const pepper = process.env.BETA_ACCESS_CODE_PEPPER || 'inside-loop';
  return sha256(`${pepper}:request:${String(value || '')}`);
}

module.exports = { hashAccessCode, generateAccessCode, hashRequestValue };
