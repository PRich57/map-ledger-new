import { Request, Response } from 'express';

export default async function mappingSuggest(req: Request, res: Response) {
  res.status(501).json({ message: 'mapping/suggest endpoint not implemented' });
}
