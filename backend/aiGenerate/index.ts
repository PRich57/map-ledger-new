import type { HttpRequest, InvocationContext } from '@azure/functions';
import { json, readJson } from '../src/http';
import { openai, defaultModel, useJsonMode } from '../src/utils/openai';

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
type Body = {
  system?: string;
  prompt?: string;
  messages?: Msg[];
  temperature?: number;
};

function mentionsJson(messages: Msg[]): boolean {
  return messages.some(m => /json/i.test(m.content));
}

export default async function (req: HttpRequest, _ctx: InvocationContext) {
  try {
    const body = (await readJson<Body>(req)) ?? {};

    // Build messages array
    const messages: Msg[] =
      body.messages?.length
        ? body.messages
        : [
            body.system ? { role: 'system', content: body.system } : null,
            { role: 'user', content: body.prompt || 'Say hello' }
          ].filter(Boolean) as Msg[];

    // If JSON mode is enabled but the prompt doesn't mention "json",
    // prepend a system instruction so OpenAI will accept response_format=json_object.
    let effectiveMessages = messages;
    if (useJsonMode && !mentionsJson(effectiveMessages)) {
      effectiveMessages = [
        {
          role: 'system',
          content:
            'You are a JSON API. Respond with a single valid JSON object, no extra text. ' +
            'If uncertain, still return a JSON object. Always output strictly valid JSON.'
        },
        ...messages
      ];
    }

    const response = await openai.chat.completions.create({
      model: defaultModel,
      messages: effectiveMessages,
      temperature: typeof body.temperature === 'number' ? body.temperature : 0.2,
      ...(useJsonMode ? { response_format: { type: 'json_object' } } : {})
    });

    const content = response.choices?.[0]?.message?.content ?? '';

    // We keep `content` as a string. If you prefer, you can attempt JSON.parse here.
    return json({
      model: response.model,
      usage: response.usage,
      content
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[aiGenerate] error', err);
    return json({ message: 'OpenAI request failed' }, 400);
  }
}
