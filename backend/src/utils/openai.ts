import OpenAI from 'openai';
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export const defaultModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
export const useJsonMode = String(process.env.OPENAI_JSON_MODE || '').toLowerCase() === 'true';
