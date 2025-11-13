import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { json, readJson } from '../../http';
import { openai, defaultModel, useJsonMode } from '../../utils/openai';

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
type Body = {
  system?: string;
  prompt?: string;
  messages?: Msg[];
  temperature?: number;
};

function mentionsJson(messages: Msg[]): boolean {
  return messages.some(message => /json/i.test(message.content));
}

export async function aiGenerateHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const body = (await readJson<Body>(request)) ?? {};

    const messages: Msg[] =
      body.messages?.length
        ? body.messages
        : [
            body.system ? { role: 'system', content: body.system } : null,
            { role: 'user', content: body.prompt || 'Say hello' }
          ].filter(Boolean) as Msg[];

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

    return json({
      model: response.model,
      usage: response.usage,
      content
    });
  } catch (error) {
    context.error('[aiGenerate] error', error);
    return json({ message: 'OpenAI request failed' }, 400);
  }
}

app.http('aiGenerate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'ai/generate',
  handler: aiGenerateHandler
});

export default aiGenerateHandler;
